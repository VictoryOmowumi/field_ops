"use client";

import Link from "next/link";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import AuthPasswordSetupForm from "@/components/auth/AuthPasswordSetupForm";
import { Button } from "@/components/ui/button";

export default function AcceptInvitePage() {
  return (
    <AuthSplitLayout
      title="Accept invite"
      description="Set your password to activate your ActivationIQ account."
      footer={
        <Button variant="outline" className="rounded-xl" asChild>
          <Link href="/login">Back to Login</Link>
        </Button>
      }
    >
      <AuthPasswordSetupForm
        invalidSessionMessage="Invite link is invalid or expired. Ask for a new invite."
        validatingMessage="Validating invite link..."
        passwordPlaceholder="Create password"
        confirmPasswordPlaceholder="Confirm password"
        submitLabel="Set Password"
        submittingLabel="Setting password..."
        successMessage="Invite accepted. You can now sign in."
      />
    </AuthSplitLayout>
  );
}
