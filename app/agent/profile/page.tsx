"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Briefcase01Icon,
  Mail01Icon,
  PhoneIncoming as PhoneIcon,
  ReloadIcon,
  ShieldUserIcon,
  UserCircleIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";

import LogoutButton from "@/components/auth/LogoutButton";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentBootstrap } from "@/hooks/useAgentBootstrap";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const query = useAgentBootstrap();

  useEffect(() => {
    if (query.error) {
      toast.error((query.error as Error).message);
    }
  }, [query.error]);

  const bootstrap = query.data;

  const activeCampaigns = useMemo(() => {
    return (bootstrap?.assignedCampaigns ?? []).filter(
      (c) => c.status?.toLowerCase() === "active"
    ).length;
  }, [bootstrap?.assignedCampaigns]);

  const pendingSync = bootstrap?.syncState.pending ?? 0;
  const failedSync = bootstrap?.syncState.failed ?? 0;

  const fullName = bootstrap?.profile.fullName || "Agent";
  const role = bootstrap?.profile.organizationRole || "Agent";
  const initials = getInitials(fullName);

  const syncLabel =
    failedSync > 0
      ? "Sync issues"
      : pendingSync > 0
        ? "Pending sync"
        : "Fully synced";

  const syncTone =
    failedSync > 0
      ? "bg-red-50 text-red-700 border-red-100"
      : pendingSync > 0
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-emerald-50 text-emerald-700 border-emerald-100";

  return (
    <main className="min-h-screen space-y-5 pb-24 pt-4">
      <section className="relative overflow-hidden ">
       
        <div className="relative flex flex-col items-start gap-4">
          <div className="ml-2 mt-1 grid h-16 w-16 shrink-0 place-items-center rounded-4xl bg-white/10 text-xl font-semibold ring-1 ring-orange-500/15">
            {query.isLoading ? (
              <HugeiconsIcon icon={UserCircleIcon} size={30} strokeWidth={1.7} />
            ) : (
              initials
            )}
          </div>

          <div className="min-w-0 flex-1">
           

            {query.isLoading ? (
              <Skeleton className="mt-3 h-7 w-40 bg-white/15" />
            ) : (
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
                {fullName}
              </h1>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <ProfileBadge icon={ShieldUserIcon} label={role} />
              <ProfileBadge icon={Briefcase01Icon} label="ActivationIQ" />
            </div>
          </div>
        </div>

        <div className="relative mt-2 grid grid-cols-3 gap-2 bg-primary/50 p-4 rounded-2xl">
          <HeroMetric label="Campaigns" value={query.isLoading ? "—" : activeCampaigns} />
          <HeroMetric label="Pending" value={query.isLoading ? "—" : pendingSync} />
          <HeroMetric label="Failed" value={query.isLoading ? "—" : failedSync} />
        </div>
      </section>

      <section
        className={cn(
          "flex items-center justify-between rounded-3xl border p-4",
          syncTone
        )}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/70">
            <HugeiconsIcon
              icon={failedSync > 0 ? Alert02Icon : ReloadIcon}
              size={20}
              strokeWidth={1.8}
            />
          </div>
          <div>
            <p className="text-sm font-semibold">{syncLabel}</p>
            <p className="text-xs opacity-75">
              {failedSync > 0
                ? `${failedSync} record(s) need attention.`
                : pendingSync > 0
                  ? `${pendingSync} record(s) waiting to upload.`
                  : "Your field data is up to date."}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-4xl border border-border/70 bg-card p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight">Account Details</h2>
          <p className="text-xs text-muted-foreground">
            Contact and access information.
          </p>
        </div>

        <div className="divide-y divide-border/70">
          <InfoRow
            icon={PhoneIcon}
            label="Phone"
            value={bootstrap?.profile.phone || "Not provided"}
          />
          <InfoRow
            icon={Mail01Icon}
            label="Email"
            value={bootstrap?.profile.email || "Not provided"}
          />
          <InfoRow
            icon={ShieldUserIcon}
            label="Role"
            value={role}
          />
        </div>
      </section>

      <section className="rounded-4xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight">App Settings</h2>
          <p className="text-xs text-muted-foreground">
            Install app and manage your session.
          </p>
        </div>

        <div className="space-y-3">
          <InstallAppButton className="h-12 w-full rounded-2xl bg-primary font-medium" />

          <div className="flex w-full justify-end mt-5">
            <LogoutButton />
          </div>
         
        </div>
      </section>
    </main>
  );
}

function ProfileBadge({
  icon,
  label,
}: {
  icon: typeof ShieldUserIcon;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/75 ring-1 ring-white/10">
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.8} />
      {label}
    </span>
  );
}

function HeroMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="">
      <p className="text-[11px] text-taupe-800">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: typeof PhoneIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-muted">
        <HugeiconsIcon icon={icon} size={19} strokeWidth={1.8} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
