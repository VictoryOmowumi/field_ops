"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";

import { extractAppRole, getDefaultRouteForRole } from "@/lib/auth/roles";
import { normalizePhoneToE164 } from "@/lib/auth/phone";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabaseClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

const RESEND_COOLDOWN_SECONDS = 30;

type AuthContextResponse = {
  success: boolean;
  user?: {
    memberships?: Array<{
      status?: "active" | "inactive" | "invited" | "suspended";
      organizations?: { slug?: string | null };
    }>;
  };
};

async function verifyMembershipAccess(accessToken: string, orgSlug?: string | null) {
  const response = await fetch("/api/auth/context", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { allowed: true as const };
  const payload = (await response.json()) as AuthContextResponse;
  const memberships = payload.user?.memberships ?? [];
  if (orgSlug) {
    const hasMatchingOrg = memberships.some((item) => item.organizations?.slug?.toLowerCase() === orgSlug.toLowerCase());
    if (!hasMatchingOrg) {
      return {
        allowed: false as const,
        message: "This account does not belong to the selected organization workspace.",
      };
    }
  }
  if (memberships.some((item) => item.status === "active")) return { allowed: true as const };
  if (memberships.some((item) => item.status === "suspended")) {
    return { allowed: false as const, message: "Your account has been suspended. Contact your administrator." };
  }
  if (memberships.some((item) => item.status === "inactive")) {
    return { allowed: false as const, message: "Your account has been deactivated. Contact your administrator." };
  }
  return { allowed: true as const };
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const nextPath = useMemo(() => searchParams.get("next") || "/agent/home", [searchParams]);
  const orgSlug = useMemo(() => searchParams.get("org"), [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Phone OTP login state
  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phonePending, setPhonePending] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function completeSignIn(user: User, session: Session | null) {
    const role = extractAppRole(user);
    if (!role) {
      await supabaseClient.auth.signOut();
      return { ok: false as const, message: "Your user role is missing. Contact an administrator." };
    }

    if (role !== "super_admin" && session?.access_token) {
      const access = await verifyMembershipAccess(session.access_token, orgSlug);
      if (!access.allowed) {
        await supabaseClient.auth.signOut();
        return { ok: false as const, message: access.message };
      }
    }

    if (nextPath.startsWith("/agent") && role !== "agent") {
      router.replace(getDefaultRouteForRole(role));
      return { ok: true as const };
    }

    router.replace(nextPath.startsWith("/") ? nextPath : getDefaultRouteForRole(role));
    return { ok: true as const };
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      if (!session) {
        setCheckingSession(false);
        return;
      }

      const result = await completeSignIn(session.user, session);
      if (!result.ok) {
        setCheckingSession(false);
        if (result.message) toast.error(result.message);
        return;
      }
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPath, orgSlug, router]);

  useEffect(() => {
    if (searchParams.get("error") === "role_denied") {
      toast.error("Your account role is not authorized for this area.");
    }
  }, [searchParams]);

  const onSubmit = handleSubmit(async (values) => {
    setPendingMessage("Signing you in...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error || !data.user) {
      setPendingMessage(null);
      toast.error(error?.message ?? "Login failed. Check credentials and try again.");
      return;
    }

    setPendingMessage("Redirecting to your workspace...");
    const result = await completeSignIn(data.user, data.session);
    if (!result.ok) {
      setPendingMessage(null);
      if (result.message) toast.error(result.message);
    }
  });

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
    const { data, error } = await supabaseClient.auth.verifyOtp({
      phone: phoneInput,
      token,
      type: "sms",
    });

    if (error || !data.user) {
      setPhonePending(null);
      setPhoneError(error?.message ?? "Invalid or expired code. Please try again.");
      return;
    }

    setPhonePending("Redirecting to your workspace...");
    const result = await completeSignIn(data.user, data.session);
    if (!result.ok) {
      setPhonePending(null);
      if (result.message) setPhoneError(result.message);
    }
  }

  function resetPhoneFlow() {
    setPhoneStep("phone");
    setOtpInput("");
    setPhoneError(null);
    setResendCooldown(0);
  }

  if (checkingSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </main>
    );
  }

  return (
    <AuthSplitLayout
      title="Welcome back"
      description="Sign in to continue to your workspace."
      footer={
        <p>
          Forgot your password?{" "}
          <Link href="/forgot-password" className="font-medium text-foreground hover:underline">
            Reset it
          </Link>
        </p>
      }
    >
      <Tabs defaultValue="email" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="phone" onClick={resetPhoneFlow}>
            Phone
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Your email
              </label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-red-600">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pr-11"
                  {...register("password")}
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
              {errors.password ? <p className="text-xs text-red-600">{errors.password.message}</p> : null}
            </div>

            <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {pendingMessage ?? "Signing in..."}
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="phone">
          {phoneStep === "phone" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium">
                  Phone number
                </label>
                <Input
                  id="phone"
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
                <label htmlFor="otp" className="text-sm font-medium">
                  Verification code
                </label>
                <p className="text-xs text-muted-foreground">Enter the code sent to {phoneInput}.</p>
                <Input
                  id="otp"
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
                  "Verify and sign in"
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
          )}
        </TabsContent>
      </Tabs>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
