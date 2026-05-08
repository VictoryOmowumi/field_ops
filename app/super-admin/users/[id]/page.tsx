"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseClient } from "@/lib/supabase/client";
import type { PlatformUserDetail } from "@/types/platform";

type OrgStatus = "active" | "inactive" | "invited" | "suspended";
type OrgRole = "org_admin" | "supervisor" | "agent";
type AppRole = "agent" | "admin" | "super_admin";

export default function SuperAdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [user, setUser] = useState<PlatformUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appRole, setAppRole] = useState<AppRole>("admin");
  const [orgRole, setOrgRole] = useState<OrgRole>("agent");
  const [orgStatus, setOrgStatus] = useState<OrgStatus>("active");

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const response = await fetch(`/api/platform/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        user?: PlatformUserDetail;
      };
      setLoading(false);
      if (!response.ok || !result.success || !result.user) {
        toast.error(result.message ?? "Failed to load user.");
        return;
      }

      setUser(result.user);
      const currentOrgRole = result.user.role as OrgRole;
      setOrgRole(currentOrgRole === "org_admin" || currentOrgRole === "supervisor" || currentOrgRole === "agent" ? currentOrgRole : "agent");
      setOrgStatus((result.user.status.toLowerCase() as OrgStatus) || "active");
      setAppRole(result.user.role === "org_admin" || result.user.role === "supervisor" ? "admin" : result.user.role === "super_admin" ? "super_admin" : "agent");
    }
    void loadUser();
  }, [userId]);

  async function saveAccess() {
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/platform/users/${userId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appRole,
        orgRole,
        orgStatus,
      }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to update access.");
      return;
    }
    toast.success("Access updated.");
    setUser((previous) => previous ? { ...previous, role: orgRole, status: orgStatus.charAt(0).toUpperCase() + orgStatus.slice(1) } : previous);
  }

  async function resendInvite() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const response = await fetch(`/api/platform/users/${userId}/resend-invite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to resend invite.");
      return;
    }
    toast.success(result.message ?? "Invite resent.");
  }

  if (loading) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">Loading user...</div>;
  if (!user) return <div className="rounded-3xl border border-border p-4 text-sm text-muted-foreground">User not found.</div>;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">{user.status}</Badge>
            <span className="text-sm text-muted-foreground">{user.id}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.role} · {user.scope}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild><Link href="/super-admin/users">Back</Link></Button>
          <Button className="rounded-full" onClick={saveAccess} disabled={saving}>{saving ? "Updating..." : "Update Access"}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-9">
          <h2 className="font-semibold">User Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Info label="Full Name" value={user.name} />
            <Info label="Email" value={user.email} />
            <Info label="Phone" value={user.phone} />
            <Info label="Role" value={user.role} />
            <Info label="Scope" value={user.scope} />
            <Info label="Status" value={user.status} />
          </div>
        </section>

        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-3">
          <h2 className="font-semibold">Access Controls</h2>
          <div className="mt-4 space-y-3">
            <Control label="Can manage organizations" value={appRole === "super_admin" ? "Yes" : "No"} />
            <Control label="Can view all campaigns" value={appRole === "super_admin" ? "Yes" : "No"} />
            <Control label="Can export cross-tenant reports" value={appRole === "super_admin" ? "Yes" : "No"} />
            <Control label="Login status" value={user.status} />
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs text-muted-foreground">App role</p>
              <Select value={appRole} onValueChange={(value: AppRole) => setAppRole(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">agent</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="super_admin">super_admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Org role</p>
              <Select value={orgRole} onValueChange={(value: OrgRole) => setOrgRole(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">org_admin</SelectItem>
                  <SelectItem value="supervisor">supervisor</SelectItem>
                  <SelectItem value="agent">agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Org status</p>
              <Select value={orgStatus} onValueChange={(value: OrgStatus) => setOrgStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                  <SelectItem value="invited">invited</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full rounded-full" onClick={resendInvite}>Resend Invite</Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className=" p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Control({ label, value }: { label: string; value: string }) {
  return (
    <div className=" p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

