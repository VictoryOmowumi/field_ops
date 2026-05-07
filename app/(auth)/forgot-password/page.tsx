"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email.");
      return;
    }

    setSubmitting(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Reset link sent. Check your email.");
  }

  return (
    <AuthSplitLayout
      title="Forgot password"
      description="Enter your email and we will send a password reset link."
      footer={
        <p>
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
        <Button className="h-11 w-full rounded-xl" disabled={submitting}>
          {submitting ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
