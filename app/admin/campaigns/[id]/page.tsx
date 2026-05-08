"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabaseClient } from "@/lib/supabase/client";

type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  campaign_type: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "completed";
  state: string | null;
  lga: string | null;
  target_outlets: number | null;
  target_conversions: number | null;
  expected_reps: number | null;
  outlet_types: string[];
  products: Array<{ sku?: string; name?: string; price?: number | null }>;
  form_requirements: Record<string, boolean>;
  runtime_form_config?: Record<string, unknown>;
  campaign_tasks?: string[];
  assigned_supervisor_user_id: string | null;
  created_at: string;
};

type AdminUser = {
  id: string;
  name: string;
  displayName?: string;
  email?: string | null;
  organizationRole?: "org_admin" | "supervisor" | "agent";
  status?: "active" | "inactive" | "invited" | "suspended";
};

type CampaignAssignment = {
  id: string;
  user_id: string;
  role: "agent" | "supervisor";
  status: string;
};

type CampaignActivity = {
  id: string;
  type: "visit" | "sale";
  status: string;
  outlet: string;
  actor: string;
  createdAt: string;
  saleCount?: number;
  saleLines?: Array<{ id: string; product_name: string | null; quantity: number | null }>;
};

export default function CampaignDetailsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [assignments, setAssignments] = useState<CampaignAssignment[]>([]);
  const [activities, setActivities] = useState<CampaignActivity[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [exportingActivities, setExportingActivities] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [supervisorUserId, setSupervisorUserId] = useState<string>("none");

  const supervisors = useMemo(
    () =>
      users.filter(
        (user) => user.organizationRole === "supervisor" || user.organizationRole === "org_admin"
      ),
    [users]
  );
  const agents = useMemo(
    () => users.filter((user) => user.organizationRole === "agent"),
    [users]
  );

  useEffect(() => {
    async function loadCampaign() {
      if (!campaignId) {
        setLoading(false);
        return;
      }

      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const [campaignResponse, usersResponse, assignmentsResponse] = await Promise.all([
        fetch(`/api/admin/campaigns/${campaignId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/campaigns/${campaignId}/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const campaignResult = (await campaignResponse.json()) as {
        success: boolean;
        message?: string;
        campaign?: Campaign;
      };
      const usersResult = (await usersResponse.json()) as {
        success: boolean;
        users?: AdminUser[];
      };
      const assignmentsResult = (await assignmentsResponse.json()) as {
        success: boolean;
        assignments?: CampaignAssignment[];
      };

      setLoading(false);

      if (!campaignResponse.ok || !campaignResult.success || !campaignResult.campaign) {
        toast.error(campaignResult.message ?? "Failed to load campaign.");
        return;
      }

      setCampaign(campaignResult.campaign);
      if (usersResponse.ok && usersResult.success) setUsers(usersResult.users ?? []);
      if (assignmentsResponse.ok && assignmentsResult.success) {
        const nextAssignments = assignmentsResult.assignments ?? [];
        setAssignments(nextAssignments);
        setSelectedAgents(nextAssignments.filter((row) => row.role === "agent").map((row) => row.user_id));
      }
      setSupervisorUserId(campaignResult.campaign.assigned_supervisor_user_id ?? "none");

      const activitiesResponse = await fetch(`/api/admin/campaigns/${campaignId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const activitiesResult = (await activitiesResponse.json()) as {
        success: boolean;
        activities?: CampaignActivity[];
      };
      if (activitiesResponse.ok && activitiesResult.success) {
        setActivities((activitiesResult.activities ?? []).slice(0, 20));
      }
    }

    void loadCampaign();
  }, [campaignId]);

  async function launchCampaign() {
    if (!campaign) return;
    setLaunching(true);

    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLaunching(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "launch" }),
    });

    const result = (await response.json()) as { success: boolean; message?: string; campaign?: Campaign };
    setLaunching(false);

    if (!response.ok || !result.success || !result.campaign) {
      toast.error(result.message ?? "Failed to launch campaign.");
      return;
    }

    setCampaign(result.campaign);
    toast.success("Campaign is now live.");
  }

  async function downloadCampaignActivitiesExport() {
    if (!campaign?.id) return;

    setExportingActivities(true);
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const response = await fetch(
        `/api/admin/reports/export?type=campaign-activities&campaignId=${campaign.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to export campaign activities.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "campaign-activities.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExportingActivities(false);
    }
  }

  function resetAssignDialogFromCurrent() {
    setSelectedAgents(assignments.filter((row) => row.role === "agent").map((row) => row.user_id));
    setSupervisorUserId(campaign?.assigned_supervisor_user_id ?? "none");
  }

  function openAssignDialog() {
    resetAssignDialogFromCurrent();
    setAssignDialogOpen(true);
  }

  function toggleAgent(userId: string) {
    setSelectedAgents((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
  }

  async function saveAssignments() {
    if (!campaignId) return;
    setSavingAssignments(true);

    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSavingAssignments(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/campaigns/${campaignId}/assignments`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supervisorUserId: supervisorUserId === "none" ? null : supervisorUserId,
        agentUserIds: selectedAgents,
      }),
    });

    const result = (await response.json()) as { success: boolean; message?: string };
    setSavingAssignments(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save assignments.");
      return;
    }

    setAssignments(
      selectedAgents.map((userId, index) => ({
        id: `local-${userId}-${index}`,
        user_id: userId,
        role: "agent",
        status: "active",
      }))
    );
    setCampaign((previous) =>
      previous
        ? {
            ...previous,
            assigned_supervisor_user_id: supervisorUserId === "none" ? null : supervisorUserId,
          }
        : previous
    );
    setAssignDialogOpen(false);
    toast.success("Assignments updated.");
  }

  const supervisorName = useMemo(() => {
    if (!campaign?.assigned_supervisor_user_id) return "-";
    const found = users.find((user) => user.id === campaign.assigned_supervisor_user_id);
    return found?.displayName ?? found?.name ?? campaign.assigned_supervisor_user_id;
  }, [campaign, users]);

  const assignedRepRows = useMemo(() => {
    return assignments
      .filter((row) => row.role === "agent")
      .map((row) => {
        const user = users.find((candidate) => candidate.id === row.user_id);
        return {
          id: row.id,
          userId: row.user_id,
          name: user?.displayName ?? user?.name ?? row.user_id,
          email: user?.email ?? "-",
          role: user?.organizationRole ?? "agent",
          status: user?.status ?? row.status,
        };
      });
  }, [assignments, users]);

  if (loading) {
    return (
      <div className="rounded-4xl bg-card p-12 text-center shadow-sm ring-1 ring-border/60">
        <div className="mx-auto w-full container space-y-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="rounded-4xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
        Campaign not found.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              {campaign.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {campaign.start_date ?? "-"} - {campaign.end_date ?? "-"}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {campaign.description || "No campaign description yet."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/admin/campaigns">Back</Link>
          </Button>
          <Button
            variant="outline"
            className="rounded-full px-5"
            disabled={exportingActivities}
            onClick={() => void downloadCampaignActivitiesExport()}
          >
            {exportingActivities ? "Exporting..." : "Export Activities"}
          </Button>
          {campaign.status === "draft" && (
            <Button className="rounded-full px-5" disabled={launching} onClick={launchCampaign}>
              {launching ? "Launching..." : "Go Live"}
            </Button>
          )}
          <Button className="rounded-full px-5" asChild>
            <Link href={`/admin/campaigns/${campaign.id}/edit`}>Edit Campaign</Link>
          </Button>
        </div>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Overview</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Campaign type" value={campaign.campaign_type || "-"} />
          <Info
            label="Tasks"
            value={(campaign.campaign_tasks ?? []).length ? (campaign.campaign_tasks ?? []).join(", ") : "-"}
          />
          <Info label="Territory" value={[campaign.state, campaign.lga].filter(Boolean).join(" / ") || "-"} />
          <Info label="Assigned supervisor" value={supervisorName} />
          <Info label="Target outlets" value={campaign.target_outlets?.toLocaleString() ?? "-"} />
          <Info label="Target conversions" value={campaign.target_conversions?.toLocaleString() ?? "-"} />
          <Info label="Expected reps" value={campaign.expected_reps?.toLocaleString() ?? "-"} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Assigned Reps</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Campaign field agents with role and status.
              </p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={openAssignDialog}>
              Assign Reps
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Rep</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignedRepRows.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                      No reps assigned yet.
                    </td>
                  </tr>
                ) : (
                  assignedRepRows.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-4 font-medium">{row.name}</td>
                      <td className="px-4 py-4 text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-4 capitalize">{String(row.role).replace("_", " ")}</td>
                      <td className="px-4 py-4">
                        <Badge className={`rounded-full ${statusBadgeClass(row.status)}`}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <h2 className="font-semibold">Products / SKUs</h2>
          <div className="mt-3 space-y-2">
            {(campaign.products ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No products configured.</p>
            ) : (
              (campaign.products ?? []).map((product, index) => (
                <p key={`${product.sku ?? "sku"}-${index}`} className="text-sm">
                  {product.name ?? product.sku ?? "Unnamed product"}
                </p>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Form Requirements</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(campaign.form_requirements ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No form rules configured.</p>
          ) : (
            Object.entries(campaign.form_requirements ?? {}).map(([key, enabled]) => (
              <p key={key} className="text-sm">
                {key}: {enabled ? "Required" : "Optional"}
              </p>
            ))
          )}
        </div>
        <div className="mt-4 rounded-2xl bg-muted/35 p-3 text-xs text-muted-foreground">
          Runtime config keys: {Object.keys(campaign.runtime_form_config ?? {}).length || 0}
        </div>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Configuration Snapshot</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Full campaign configuration payload used by agent runtime.
              </p>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Collapse</span>
          </summary>
          <pre className="mt-4 overflow-auto rounded-2xl bg-background p-4 text-xs">
            {JSON.stringify(
              {
                campaignType: campaign.campaign_type,
                tasks: campaign.campaign_tasks,
                outletTypes: campaign.outlet_types,
                products: campaign.products,
                formRequirements: campaign.form_requirements,
                runtimeFormConfig: campaign.runtime_form_config,
              },
              null,
              2
            )}
          </pre>
        </details>
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Campaign Activities</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest visit events grouped with related sales lines.</p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Activity</th>
                <th className="px-4 py-3 text-left font-medium">Outlet</th>
                <th className="px-4 py-3 text-left font-medium">Actor</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Sales</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                    No activities yet for this campaign.
                  </td>
                </tr>
              ) : (
                activities.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-4 capitalize">
                      {item.type === "visit" ? "Visit" : "Sale"}
                    </td>
                    <td className="px-4 py-4">{item.outlet}</td>
                    <td className="px-4 py-4">{item.actor}</td>
                    <td className="px-4 py-4">
                      <Badge className="rounded-full capitalize">{item.status}</Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {item.type === "visit" ? `${item.saleCount ?? 0} line(s)` : "1 line"}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/campaigns/${campaign.id}/activities/${item.id}`}
                        className="text-sm text-primary underline"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-5xl!">
          <DialogHeader>
            <DialogTitle>Assign Reps</DialogTitle>
            <DialogDescription>
              Link supervisors and field agents to this campaign without leaving this page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="max-w-full">
              <p className="mb-2 text-sm font-medium">Assigned supervisor</p>
              <Select value={supervisorUserId} onValueChange={setSupervisorUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supervisor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {supervisors.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName ?? user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-3xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Assign</th>
                    <th className="px-4 py-3 text-left font-medium">Rep</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                        No agents found. Invite agents from Users first.
                      </td>
                    </tr>
                  ) : (
                    agents.map((rep) => (
                      <tr key={rep.id} className="border-t border-border">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedAgents.includes(rep.id)}
                            onChange={() => toggleAgent(rep.id)}
                          />
                        </td>
                        <td className="px-4 py-4 font-medium">{rep.displayName ?? rep.name}</td>
                        <td className="px-4 py-4 text-muted-foreground">{rep.email ?? "-"}</td>
                        <td className="px-4 py-4">
                          <Badge className={`rounded-full ${statusBadgeClass(rep.status ?? "active")}`}>
                            {rep.status ?? "active"}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                resetAssignDialogFromCurrent();
                setAssignDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button className="rounded-full px-6" disabled={savingAssignments} onClick={saveAssignments}>
              {savingAssignments ? "Saving..." : "Save Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusBadgeClass(status: string) {
  if (status === "active") return "bg-emerald-500/10 text-emerald-600";
  if (status === "invited") return "bg-amber-500/10 text-amber-600";
  if (status === "suspended") return "bg-red-500/10 text-red-600";
  return "bg-muted text-muted-foreground";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}
