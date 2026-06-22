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
import { useUiVariant } from "@/components/providers/tenant-experience-provider";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabaseClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const phoneLoginSchema = z.object({
  phone: z.string().min(1, "Enter your phone number."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;
type PhoneLoginValues = z.infer<typeof phoneLoginSchema>;

type AuthContextResponse = {
  success: boolean;
  user?: {
    memberships?: Array<{
      status?: "active" | "inactive" | "invited" | "suspended";
      organizations?: { slug?: string | null };
    }>;
  };
};

function reportLoginFailure(method: "email" | "phone", reason: string) {
  fetch("/api/observability/login-failed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, reason }),
  }).catch(() => {});
}

function reportLoginSuccess(method: "email" | "phone") {
  fetch("/api/observability/login-success", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  }).catch(() => {});
}

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
  const uiVariant = useUiVariant();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPhonePassword, setShowPhonePassword] = useState(false);
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

  const {
    register: registerPhone,
    handleSubmit: handlePhoneSubmit,
    formState: { errors: phoneErrors, isSubmitting: isPhoneSubmitting },
  } = useForm<PhoneLoginValues>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

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
      reportLoginFailure("email", error?.message ?? "Login failed");
      toast.error(error?.message ?? "Login failed. Check credentials and try again.");
      return;
    }

    reportLoginSuccess("email");
    setPendingMessage("Redirecting to your workspace...");
    const result = await completeSignIn(data.user, data.session);
    if (!result.ok) {
      setPendingMessage(null);
      if (result.message) toast.error(result.message);
    }
  });

  const onPhoneSubmit = handlePhoneSubmit(async (values) => {
    const normalized = normalizePhoneToE164(values.phone);
    if (!normalized) {
      toast.error("Enter a valid phone number.");
      return;
    }

    setPendingMessage("Signing you in...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      phone: normalized,
      password: values.password,
    });

    if (error || !data.user) {
      setPendingMessage(null);
      reportLoginFailure("phone", error?.message ?? "Login failed");
      if (error?.message && /invalid login credentials/i.test(error.message)) {
        toast.error("Incorrect phone number or password.");
      } else {
        toast.error(error?.message ?? "Login failed. Check credentials and try again.");
      }
      return;
    }

    reportLoginSuccess("phone");
    setPendingMessage("Redirecting to your workspace...");
    const result = await completeSignIn(data.user, data.session);
    if (!result.ok) {
      setPendingMessage(null);
      if (result.message) toast.error(result.message);
    }
  });

  if (checkingSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </main>
    );
  }

  const emailForm = (
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
  );

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
      {uiVariant === "enhanced" ? (
        <Tabs defaultValue="email" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="phone">Phone</TabsTrigger>
          </TabsList>

          <TabsContent value="email">{emailForm}</TabsContent>

          <TabsContent value="phone">
            <form className="space-y-4" onSubmit={onPhoneSubmit}>
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
                  {...registerPhone("phone")}
                />
                {phoneErrors.phone ? <p className="text-xs text-red-600">{phoneErrors.phone.message}</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="phone-password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="phone-password"
                    type={showPhonePassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="pr-11"
                    {...registerPhone("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPhonePassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPhonePassword ? "Hide password" : "Show password"}
                    aria-pressed={showPhonePassword}
                  >
                    {showPhonePassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {phoneErrors.password ? <p className="text-xs text-red-600">{phoneErrors.password.message}</p> : null}
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm" disabled={isPhoneSubmitting}>
                {isPhoneSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {pendingMessage ?? "Signing in..."}
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <Link href="/forgot-password?method=phone" className="font-medium text-foreground hover:underline">
                  Forgot password?
                </Link>
              </p>
            </form>
          </TabsContent>
        </Tabs>
      ) : (
        emailForm
      )}
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
