"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseClient } from "@/lib/supabase/client";

type OrgUser = {
  id: string;
  name: string;
  role: "org_admin" | "supervisor" | "agent";
  status: string;
};

export default function AssignRepsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [supervisorUserId, setSupervisorUserId] = useState<string>("none");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const supervisors = useMemo(() => users.filter((u) => u.role === "supervisor" || u.role === "org_admin"), [users]);
  const agents = useMemo(() => users.filter((u) => u.role === "agent"), [users]);

  useEffect(() => {
    async function loadData() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const [usersResponse, assignmentResponse] = await Promise.all([
        fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/admin/campaigns/${campaignId}/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const usersResult = (await usersResponse.json()) as { success: boolean; users?: OrgUser[]; message?: string };
      const assignmentResult = (await assignmentResponse.json()) as {
        success: boolean;
        message?: string;
        campaign?: { assigned_supervisor_user_id: string | null };
        assignments?: Array<{ user_id: string; role: "agent" | "supervisor" }>;
      };

      setLoading(false);

      if (!usersResponse.ok || !usersResult.success) {
        toast.error(usersResult.message ?? "Failed to load organization users.");
        return;
      }
      if (!assignmentResponse.ok || !assignmentResult.success) {
        toast.error(assignmentResult.message ?? "Failed to load assignments.");
        return;
      }

      setUsers(usersResult.users ?? []);
      setSupervisorUserId(assignmentResult.campaign?.assigned_supervisor_user_id ?? "none");
      setSelectedAgents((assignmentResult.assignments ?? []).filter((a) => a.role === "agent").map((a) => a.user_id));
    }

    void loadData();
  }, [campaignId]);

  async function saveAssignments() {
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSaving(false);
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
    setSaving(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save assignments.");
      return;
    }

    toast.success("Assignments updated.");
    router.push(`/admin/campaigns/${campaignId}`);
  }

  function toggleAgent(userId: string) {
    setSelectedAgents((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Assign Reps</h1>
          <p className="mt-1 text-sm text-muted-foreground">Link supervisors and field agents to this campaign.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild>
          <Link href={`/admin/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 space-y-5">
        <div className="max-w-md">
          <p className="mb-2 text-sm font-medium">Assigned supervisor</p>
          <Select value={supervisorUserId} onValueChange={setSupervisorUserId}>
            <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {supervisors.map((user) => (
                <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
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
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={4}>Loading organization users...</td></tr>
              ) : agents.length === 0 ? (
                <tr className="border-t border-border"><td className="px-4 py-6 text-muted-foreground" colSpan={4}>No agents found. Invite agents from Users first.</td></tr>
              ) : (
                agents.map((rep) => (
                  <tr key={rep.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <input type="checkbox" checked={selectedAgents.includes(rep.id)} onChange={() => toggleAgent(rep.id)} />
                    </td>
                    <td className="px-4 py-4 font-medium">{rep.name}</td>
                    <td className="px-4 py-4 text-muted-foreground">{rep.role}</td>
                    <td className="px-4 py-4">{rep.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button className="rounded-full px-6" onClick={saveAssignments} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Assignments"}
          </Button>
        </div>
      </section>
    </div>
  );
}

