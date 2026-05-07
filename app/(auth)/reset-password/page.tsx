"use client";

import Link from "next/link";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import AuthPasswordSetupForm from "@/components/auth/AuthPasswordSetupForm";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout
      title="Reset password"
      description="Set a new password for your ActivationIQ account."
      footer={
        <Button variant="outline" className="rounded-xl" asChild>
          <Link href="/login">Back to Login</Link>
        </Button>
      }
    >
      <AuthPasswordSetupForm
        invalidSessionMessage="Reset link is invalid or expired. Request a new one."
        validatingMessage="Validating reset link..."
        passwordPlaceholder="New password"
        confirmPasswordPlaceholder="Confirm new password"
        submitLabel="Update Password"
        submittingLabel="Updating..."
        successMessage="Password updated successfully. Please sign in."
      />
    </AuthSplitLayout>
  );
}
