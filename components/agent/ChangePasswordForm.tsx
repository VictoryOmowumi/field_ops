"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authorizedFetch } from "@/lib/api/client";
import { supabaseClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    try {
      await authorizedFetch("/api/agent/account/password-changed", { method: "POST" });
    } catch {
      // non-fatal — the password itself was already updated
    }

    setSubmitting(false);
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
    void queryClient.invalidateQueries({ queryKey: ["agent-bootstrap"] });
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="New password"
          className="pr-11"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <Input
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      <Button type="submit" className="h-11 w-full rounded-2xl font-medium" disabled={submitting}>
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Updating...
          </span>
        ) : (
          "Update Password"
        )}
      </Button>
    </form>
  );
}
