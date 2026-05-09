"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { extractAppRole, getDefaultRouteForRole } from "@/lib/auth/roles";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const nextPath = useMemo(() => searchParams.get("next") || "/agent/home", [searchParams]);

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

  useEffect(() => {
    async function init() {
      const { data } = await supabaseClient.auth.getSession();
      const session = data.session;
      if (!session) {
        setCheckingSession(false);
        return;
      }

      const role = extractAppRole(session.user);
      if (role) {
        if (nextPath.startsWith("/agent") && role !== "agent") {
          router.replace(getDefaultRouteForRole(role));
          return;
        }
        router.replace(nextPath.startsWith("/") ? nextPath : getDefaultRouteForRole(role));
      } else {
        await supabaseClient.auth.signOut();
        setCheckingSession(false);
      }
    }

    void init();
  }, [nextPath, router]);

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

    const role = extractAppRole(data.user);
    if (role) {
      if (nextPath.startsWith("/agent") && role !== "agent") {
        setPendingMessage("Redirecting to your workspace...");
        router.replace(getDefaultRouteForRole(role));
        return;
      }
      setPendingMessage("Redirecting to your workspace...");
      router.replace(nextPath.startsWith("/") ? nextPath : getDefaultRouteForRole(role));
      return;
    }

    await supabaseClient.auth.signOut();
    setPendingMessage(null);
    toast.error("Your user role is missing. Contact an administrator.");
  });

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
      description="Sign in to continue to your ActivationIQ workspace."
      footer={
        <p>
          Forgot your password?{" "}
          <Link href="/forgot-password" className="font-medium text-foreground hover:underline">
            Reset it
          </Link>
        </p>
      }
    >
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

