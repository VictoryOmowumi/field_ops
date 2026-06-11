"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { normalizePhoneToE164 } from "@/lib/auth/phone";
import { useUiVariant } from "@/components/providers/tenant-experience-provider";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabaseClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 30;

function ForgotPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uiVariant = useUiVariant();
  const defaultMethod = searchParams.get("method") === "phone" && uiVariant === "enhanced" ? "phone" : "email";

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phonePending, setPhonePending] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  async function handleSendOtp() {
    setPhoneError(null);
    const normalized = normalizePhoneToE164(phoneInput);
    if (!normalized) {
      setPhoneError("Enter a valid phone number.");
      return;
    }

    setPhonePending("Sending code...");
    const { error } = await supabaseClient.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: false },
    });
    setPhonePending(null);

    if (error) {
      if (/signups not allowed/i.test(error.message)) {
        setPhoneError("This phone number isn't registered. Contact your administrator.");
      } else {
        setPhoneError(error.message);
      }
      return;
    }

    setPhoneInput(normalized);
    setPhoneStep("otp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast.success("A verification code has been sent to your phone.");
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setPhoneError(null);
    setPhonePending("Resending code...");
    const { error } = await supabaseClient.auth.signInWithOtp({
      phone: phoneInput,
      options: { shouldCreateUser: false },
    });
    setPhonePending(null);

    if (error) {
      setPhoneError(error.message);
      return;
    }

    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast.success("A new verification code has been sent.");
  }

  async function handleVerifyOtp(code?: string) {
    setPhoneError(null);
    const token = (code ?? otpInput).trim();
    if (token.length < 4) {
      setPhoneError("Enter the verification code.");
      return;
    }

    setPhonePending("Verifying...");
    const { error } = await supabaseClient.auth.verifyOtp({
      phone: phoneInput,
      token,
      type: "sms",
    });

    if (error) {
      setPhonePending(null);
      setPhoneError(error.message ?? "Invalid or expired code. Please try again.");
      return;
    }

    router.replace("/reset-password");
  }

  function resetPhoneFlow() {
    setPhoneStep("phone");
    setOtpInput("");
    setPhoneError(null);
    setResendCooldown(0);
  }

  const emailForm = (
    <form className="space-y-4" onSubmit={onEmailSubmit}>
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
  );

  const phoneForm =
    phoneStep === "phone" ? (
      <div className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            value={phoneInput}
            onChange={(event) => setPhoneInput(event.target.value)}
          />
          {phoneError ? <p className="text-xs text-red-600">{phoneError}</p> : null}
        </div>

        <Button
          type="button"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
          disabled={phonePending !== null}
          onClick={handleSendOtp}
        >
          {phonePending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {phonePending}
            </span>
          ) : (
            "Send verification code"
          )}
        </Button>
      </div>
    ) : (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Enter the code sent to {phoneInput}.</p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="h-12 text-center text-lg font-semibold tracking-[0.5em]"
            value={otpInput}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
              setOtpInput(digits);
              if (digits.length === 6) void handleVerifyOtp(digits);
            }}
          />
          {phoneError ? <p className="text-xs text-red-600">{phoneError}</p> : null}
        </div>

        <Button
          type="button"
          className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
          disabled={phonePending !== null}
          onClick={() => void handleVerifyOtp()}
        >
          {phonePending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {phonePending}
            </span>
          ) : (
            "Verify code"
          )}
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button type="button" onClick={resetPhoneFlow} className="font-medium text-foreground hover:underline">
            Use a different number
          </button>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendCooldown > 0 || phonePending !== null}
            className="font-medium text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
          </button>
        </div>
      </div>
    );

  return (
    <AuthSplitLayout
      title="Forgot password"
      description="We'll help you get back into your account."
      footer={
        <p>
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {uiVariant === "enhanced" ? (
        <Tabs defaultValue={defaultMethod} className="w-full" onValueChange={() => resetPhoneFlow()}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="phone">Phone</TabsTrigger>
          </TabsList>
          <TabsContent value="email">{emailForm}</TabsContent>
          <TabsContent value="phone">{phoneForm}</TabsContent>
        </Tabs>
      ) : (
        emailForm
      )}
    </AuthSplitLayout>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      }
    >
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
