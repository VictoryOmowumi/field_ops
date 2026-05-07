"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

type AuthPasswordSetupFormProps = {
  invalidSessionMessage: string;
  validatingMessage: string;
  passwordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  successMessage: string;
};

export default function AuthPasswordSetupForm({
  invalidSessionMessage,
  validatingMessage,
  passwordPlaceholder,
  confirmPasswordPlaceholder,
  submitLabel,
  submittingLabel,
  successMessage,
}: AuthPasswordSetupFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkRecoverySession() {
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session) {
        toast.error(invalidSessionMessage);
      }
      setCheckingSession(false);
    }

    void checkRecoverySession();
  }, [invalidSessionMessage]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      await fetch("/api/auth/accept-invite/finalize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
    setSubmitting(false);

    toast.success(successMessage);
    await supabaseClient.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession) {
    return <p className="text-sm text-muted-foreground">{validatingMessage}</p>;
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Input
        type="password"
        placeholder={passwordPlaceholder}
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Input
        type="password"
        placeholder={confirmPasswordPlaceholder}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      <Button className="h-11 w-full rounded-xl" disabled={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
