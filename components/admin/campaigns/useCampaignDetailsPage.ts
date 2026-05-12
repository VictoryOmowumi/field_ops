"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { supabaseClient } from "@/lib/supabase/client";
import {
  buildCreateRepPayload,
  createDefaultRepFormValues,
  type RepFormValues,
  validateRepForm,
} from "@/lib/admin/rep-form";
import type {
  CampaignAnalyticsSummary,
  CampaignEvidenceItem,
  CampaignMapPoint,
  CampaignShareLink,
} from "@/types/campaign-intelligence";

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
  supervisor_user_ids?: string[];
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
  taskType?: string;
  status: string;
  customer?: string;
  outlet: string;
  area?: string;
  products?: string;
  location?: string;
  actor: string;
  createdAt: string;
  taskPayload?: Record<string, unknown> | null;
  saleCount?: number;
  saleLines?: Array<{ id: string; product_name: string | null; quantity: number | null }>;
};

export function useCampaignDetailsPage(campaignId?: string) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [assignments, setAssignments] = useState<CampaignAssignment[]>([]);
  const [activities, setActivities] = useState<CampaignActivity[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [registerRepOpen, setRegisterRepOpen] = useState(false);
  const [registerRepSubmitting, setRegisterRepSubmitting] = useState(false);
  const [registerRepError, setRegisterRepError] = useState<string | null>(null);
  const [registerRepForm, setRegisterRepForm] = useState<RepFormValues>(createDefaultRepFormValues);
  const [exportingActivities, setExportingActivities] = useState(false);
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [mapPoints, setMapPoints] = useState<CampaignMapPoint[]>([]);
  const [evidence, setEvidence] = useState<CampaignEvidenceItem[]>([]);
  const [shareLinks, setShareLinks] = useState<CampaignShareLink[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareExpiresAt, setShareExpiresAt] = useState(() => {
    const value = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    return value.toISOString().slice(0, 10);
  });
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [sendingShareLink, setSendingShareLink] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);

  const supervisors = useMemo(
    () => users.filter((user) => user.organizationRole === "supervisor" || user.organizationRole === "org_admin"),
    [users]
  );
  const agents = useMemo(() => users.filter((user) => user.organizationRole === "agent"), [users]);
  const registerCampaignOptions = useMemo(
    () => (campaign && campaign.status !== "completed" ? [{ id: campaign.id, name: campaign.name }] : []),
    [campaign]
  );

  const loadActivities = useCallback(
    async (token: string, nextPage: number, nextSearch: string, nextStatus: string) => {
      if (!campaignId) return;
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: "20",
      });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      if (nextStatus !== "all") params.set("status", nextStatus);
      const response = await fetch(`/api/admin/campaigns/${campaignId}/activities?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        success: boolean;
        activities?: CampaignActivity[];
        total?: number;
        message?: string;
      };
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to load campaign activities.");
        return;
      }
      setActivities(result.activities ?? []);
      setActivitiesTotal(result.total ?? 0);
    },
    [campaignId]
  );

  const loadCampaignIntelligence = useCallback(
    async (token: string) => {
      if (!campaignId) return;
      const [analyticsResponse, evidenceResponse, shareLinksResponse] = await Promise.all([
        fetch(`/api/admin/campaigns/${campaignId}/analytics`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/campaigns/${campaignId}/evidence`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/campaigns/${campaignId}/share-links`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const analyticsResult = (await analyticsResponse.json()) as {
        success: boolean;
        summary?: CampaignAnalyticsSummary;
        mapPoints?: CampaignMapPoint[];
      };
      if (analyticsResponse.ok && analyticsResult.success) {
        setSummary(analyticsResult.summary ?? null);
        setMapPoints(analyticsResult.mapPoints ?? []);
      }

      const evidenceResult = (await evidenceResponse.json()) as { success: boolean; evidence?: CampaignEvidenceItem[] };
      if (evidenceResponse.ok && evidenceResult.success) setEvidence(evidenceResult.evidence ?? []);

      const shareLinksResult = (await shareLinksResponse.json()) as { success: boolean; shareLinks?: CampaignShareLink[] };
      if (shareLinksResponse.ok && shareLinksResult.success) setShareLinks(shareLinksResult.shareLinks ?? []);
    },
    [campaignId]
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
        fetch(`/api/admin/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/campaigns/${campaignId}/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const campaignResult = (await campaignResponse.json()) as { success: boolean; message?: string; campaign?: Campaign };
      const usersResult = (await usersResponse.json()) as { success: boolean; users?: AdminUser[] };
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
        setSelectedSupervisors(nextAssignments.filter((row) => row.role === "supervisor").map((row) => row.user_id));
      }
      await Promise.all([loadActivities(token, 1, "", "all"), loadCampaignIntelligence(token)]);
    }

    void loadCampaign();
  }, [campaignId, loadActivities, loadCampaignIntelligence]);

  async function refreshAssignableUsersAndAssignments(token: string) {
    if (!campaignId) return;
    const [usersResponse, assignmentsResponse] = await Promise.all([
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/admin/campaigns/${campaignId}/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const usersResult = (await usersResponse.json()) as { success: boolean; users?: AdminUser[] };
    const assignmentsResult = (await assignmentsResponse.json()) as { success: boolean; assignments?: CampaignAssignment[] };

    if (usersResponse.ok && usersResult.success) {
      setUsers(usersResult.users ?? []);
    }
    if (assignmentsResponse.ok && assignmentsResult.success) {
      const nextAssignments = assignmentsResult.assignments ?? [];
      setAssignments(nextAssignments);
    }
  }

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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  async function deleteCampaign() {
    if (!campaignId) return;
    setDeletingCampaign(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setDeletingCampaign(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }
    try {
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as { success: boolean; message?: string };
      if (!response.ok || !result.success) {
        toast.error(result.message ?? "Failed to delete campaign.");
        return;
      }
      toast.success("Campaign deleted.");
      router.push("/admin/campaigns");
    } finally {
      setDeletingCampaign(false);
    }
  }

  async function downloadCampaignActivitiesExport() {
    if (!campaign?.id) return;
    setExportingActivities(true);
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const response = await fetch(`/api/admin/reports/export?type=campaign-activities&campaignId=${campaign.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  async function refreshShareLinks() {
    if (!campaignId) return;
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/admin/campaigns/${campaignId}/share-links`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { success: boolean; shareLinks?: CampaignShareLink[] };
    if (response.ok && result.success) setShareLinks(result.shareLinks ?? []);
  }

  async function createShareLink(sendEmail: boolean) {
    if (!campaignId) return;
    if (sendEmail && !shareRecipientEmail.trim()) {
      toast.error("Recipient email is required when sending.");
      return;
    }
    if (sendEmail) setSendingShareLink(true);
    else setCreatingShareLink(true);

    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const response = await fetch(`/api/admin/campaigns/${campaignId}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          expiresAt: `${shareExpiresAt}T23:59:59.999Z`,
          recipientEmail: shareRecipientEmail.trim() || null,
          sendEmail,
        }),
      });
      const result = (await response.json()) as { success: boolean; message?: string; shareLink?: CampaignShareLink };
      if (!response.ok || !result.success || !result.shareLink) throw new Error(result.message ?? "Failed to create share link.");
      if (result.shareLink.shareUrl) setGeneratedShareUrl(result.shareLink.shareUrl);
      setShareLinks((prev) => [result.shareLink as CampaignShareLink, ...prev]);
      toast.success(sendEmail ? "Share link sent successfully." : "Share link generated.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreatingShareLink(false);
      setSendingShareLink(false);
    }
  }

  async function revokeShareLink(shareId: string) {
    if (!campaignId) return;
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const response = await fetch(`/api/admin/campaigns/${campaignId}/share-links/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "revoke" }),
    });
    const result = (await response.json()) as { success: boolean; message?: string; shareLink?: CampaignShareLink };
    if (!response.ok || !result.success || !result.shareLink) {
      toast.error(result.message ?? "Failed to revoke link.");
      return;
    }
    setShareLinks((prev) => prev.map((item) => (item.id === shareId ? (result.shareLink as CampaignShareLink) : item)));
    toast.success("Share link revoked.");
  }

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied.");
    } catch {
      toast.error("Could not copy share link.");
    }
  }

  function resetAssignDialogFromCurrent() {
    setSelectedAgents(assignments.filter((row) => row.role === "agent").map((row) => row.user_id));
    setSelectedSupervisors(assignments.filter((row) => row.role === "supervisor").map((row) => row.user_id));
  }

  function openAssignDialog() {
    resetAssignDialogFromCurrent();
    setAssignDialogOpen(true);
  }

  function openRegisterRepDialog() {
    setRegisterRepForm(createDefaultRepFormValues());
    setRegisterRepError(null);
    setRegisterRepOpen(true);
  }

  async function submitRegisterRepFromAssignDialog() {
    const validationError = validateRepForm(registerRepForm);
    if (validationError) {
      setRegisterRepError(validationError);
      return;
    }

    setRegisterRepSubmitting(true);
    setRegisterRepError(null);
    try {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const response = await fetch("/api/admin/reps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildCreateRepPayload(registerRepForm)),
      });
      const result = (await response.json()) as {
        success: boolean;
        message?: string;
        rep?: { id: string; userId: string };
      };
      if (!response.ok || !result.success || !result.rep?.userId) {
        throw new Error(result.message ?? "Failed to register rep.");
      }

      await refreshAssignableUsersAndAssignments(token);
      setSelectedAgents((prev) => (prev.includes(result.rep!.userId) ? prev : [...prev, result.rep!.userId]));
      setRegisterRepOpen(false);
      toast.success("Rep registered. Invite sent.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to register rep.";
      setRegisterRepError(message);
      toast.error(message);
    } finally {
      setRegisterRepSubmitting(false);
    }
  }

  function toggleAgent(userId: string) {
    setSelectedAgents((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
  }

  function toggleSupervisor(userId: string) {
    setSelectedSupervisors((previous) =>
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supervisorUserIds: selectedSupervisors,
        agentUserIds: selectedAgents,
      }),
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setSavingAssignments(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save assignments.");
      return;
    }

    const nextAssignments: CampaignAssignment[] = [
      ...selectedAgents.map((userId, index) => ({
        id: `local-${userId}-${index}`,
        user_id: userId,
        role: "agent" as const,
        status: "active",
      })),
      ...selectedSupervisors.map((userId, index) => ({
        id: `local-supervisor-${userId}-${index}`,
        user_id: userId,
        role: "supervisor" as const,
        status: "active",
      })),
    ];
    setAssignments(nextAssignments);
    setCampaign((previous) => (previous ? { ...previous, supervisor_user_ids: selectedSupervisors } : previous));
    setAssignDialogOpen(false);
    toast.success("Assignments updated.");
  }

  const supervisorNames = useMemo(() => {
    const supervisorIds = assignments
      .filter((row) => row.role === "supervisor")
      .map((row) => row.user_id);
    if (supervisorIds.length === 0) return "-";
    return supervisorIds
      .map((id) => {
        const found = users.find((user) => user.id === id);
        return found?.displayName ?? found?.name ?? id;
      })
      .join(", ");
  }, [assignments, users]);

  const assignedRepRows = useMemo(
    () =>
      assignments
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
        }),
    [assignments, users]
  );

  const supervisorRows = useMemo(
    () =>
      assignments
        .filter((row) => row.role === "supervisor")
        .map((row, index) => {
          const user = users.find((candidate) => candidate.id === row.user_id);
          return {
            id: row.id || `supervisor-${row.user_id}-${index}`,
            userId: row.user_id,
            name: user?.displayName ?? user?.name ?? row.user_id,
            email: user?.email ?? "-",
            status: user?.status ?? row.status,
          };
        }),
    [assignments, users]
  );

  return {
    campaign,
    loading,
    launching,
    exportingActivities,
    summary,
    mapPoints,
    supervisorNames,
    supervisorRows,
    assignedRepRows,
    evidence,
    activities,
    activitiesTotal,
    activityPage,
    activitySearch,
    activityStatusFilter,
    assignDialogOpen,
    selectedSupervisors,
    supervisors,
    agents,
    selectedAgents,
    savingAssignments,
    registerRepOpen,
    registerRepSubmitting,
    registerRepError,
    registerRepForm,
    registerCampaignOptions,
    shareDialogOpen,
    shareExpiresAt,
    shareRecipientEmail,
    creatingShareLink,
    sendingShareLink,
    deletingCampaign,
    generatedShareUrl,
    shareLinks,
    setActivityPage,
    setActivitySearch,
    setActivityStatusFilter,
    setAssignDialogOpen,
    toggleSupervisor,
    setShareDialogOpen,
    setShareExpiresAt,
    setShareRecipientEmail,
    loadActivities,
    launchCampaign,
    deleteCampaign,
    downloadCampaignActivitiesExport,
    createShareLink,
    copyShareUrl,
    revokeShareLink,
    refreshShareLinks,
    openAssignDialog,
    openRegisterRepDialog,
    setRegisterRepOpen,
    setRegisterRepForm,
    submitRegisterRepFromAssignDialog,
    resetAssignDialogFromCurrent,
    toggleAgent,
    saveAssignments,
  };
}
