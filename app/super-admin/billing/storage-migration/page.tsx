"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

type ArchivalCandidate = {
  campaignId: string;
  campaignName: string;
  organizationId: string;
  completedAt: string;
  retentionDays: number;
  eligibleSince: string;
};

type MigrationJob = {
  id: string;
  mode: "dry_run" | "live";
  status: "running" | "completed" | "failed";
  candidate_count: number;
  migrated_count: number;
  failed_count: number;
  started_at: string;
  completed_at: string | null;
};

type MigrationItem = {
  id: string;
  visit_evidence_id: string;
  status: string;
  source_checksum: string | null;
  dest_checksum: string | null;
  error: string | null;
};

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function authHeader() {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export default function StorageMigrationPage() {
  const [candidates, setCandidates] = useState<ArchivalCandidate[]>([]);
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobItems, setSelectedJobItems] = useState<MigrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningBatch, setRunningBatch] = useState(false);
  const [purgeDays, setPurgeDays] = useState("30");
  const [purging, setPurging] = useState(false);

  async function loadAll() {
    const headers = await authHeader();
    if (!headers) {
      setLoading(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }
    const [previewRes, jobsRes] = await Promise.all([
      fetch("/api/platform/campaigns/archival-preview", { headers }),
      fetch("/api/platform/storage/migration", { headers }),
    ]);
    const previewResult = (await previewRes.json()) as { success: boolean; candidates?: ArchivalCandidate[] };
    const jobsResult = (await jobsRes.json()) as { success: boolean; jobs?: MigrationJob[] };
    setLoading(false);
    if (previewRes.ok && previewResult.success) setCandidates(previewResult.candidates ?? []);
    if (jobsRes.ok && jobsResult.success) setJobs(jobsResult.jobs ?? []);
  }

  useEffect(() => {
    async function load() {
      const headers = await authHeader();
      if (!headers) {
        setLoading(false);
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const [previewRes, jobsRes] = await Promise.all([
        fetch("/api/platform/campaigns/archival-preview", { headers }),
        fetch("/api/platform/storage/migration", { headers }),
      ]);
      const previewResult = (await previewRes.json()) as { success: boolean; candidates?: ArchivalCandidate[] };
      const jobsResult = (await jobsRes.json()) as { success: boolean; jobs?: MigrationJob[] };
      setLoading(false);
      if (previewRes.ok && previewResult.success) setCandidates(previewResult.candidates ?? []);
      if (jobsRes.ok && jobsResult.success) setJobs(jobsResult.jobs ?? []);
    }
    void load();
  }, []);

  async function runBatch(mode: "dry_run" | "live") {
    setRunningBatch(true);
    const headers = await authHeader();
    if (!headers) { setRunningBatch(false); return; }
    const response = await fetch("/api/platform/storage/migration", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const result = (await response.json()) as { success: boolean; message?: string; mode?: string };
    setRunningBatch(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Migration batch failed.");
      return;
    }
    if (mode === "live" && result.mode === "dry_run") {
      toast.warning("Ran as a dry-run — enable commercial.storage.enabled in Settings first for a live run.");
    } else {
      toast.success(mode === "live" ? "Live migration batch completed." : "Dry-run completed.");
    }
    void loadAll();
  }

  async function viewJob(jobId: string) {
    setSelectedJobId(jobId);
    const headers = await authHeader();
    if (!headers) return;
    const response = await fetch(`/api/platform/storage/migration/${jobId}`, { headers });
    const result = (await response.json()) as { success: boolean; items?: MigrationItem[] };
    if (response.ok && result.success) setSelectedJobItems(result.items ?? []);
  }

  async function runPurge(dryRun: boolean) {
    setPurging(true);
    const headers = await authHeader();
    if (!headers) { setPurging(false); return; }
    const response = await fetch("/api/platform/storage/purge", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ minAgeDays: Number(purgeDays) || 30, dryRun }),
    });
    const result = (await response.json()) as { success: boolean; message?: string; candidateCount?: number; purged?: number };
    setPurging(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Purge failed.");
      return;
    }
    toast.success(
      dryRun
        ? `${result.candidateCount ?? 0} Supabase originals are eligible to purge.`
        : `Purged ${result.purged ?? 0} verified Supabase originals.`
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Storage Migration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phase 8 archival preview and Phase 9 evidence migration to Cloudflare R2, in one place.
        </p>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Upcoming &amp; Eligible Archival</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Completed campaigns past their retention window — the nightly scheduler picks these up automatically once commercial.archive.enabled is on.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        ) : candidates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing eligible for archival right now.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <div key={candidate.campaignId} className="flex items-center justify-between rounded-2xl bg-muted/35 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{candidate.campaignName}</p>
                  <p className="text-xs text-muted-foreground">
                    Completed {new Date(candidate.completedAt).toLocaleDateString()} · {candidate.retentionDays}-day retention · eligible since {new Date(candidate.eligibleSince).toLocaleDateString()}
                  </p>
                </div>
                <Badge className="rounded-full bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">Eligible</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Evidence Migration Jobs</h2>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" disabled={runningBatch} onClick={() => void runBatch("dry_run")}>
              {runningBatch ? "Working…" : "Run Dry-Run Batch"}
            </Button>
            <Button className="rounded-full" disabled={runningBatch} onClick={() => void runBatch("live")}>
              {runningBatch ? "Working…" : "Run Live Batch"}
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          A live run only actually writes if commercial.storage.enabled is on — otherwise it silently runs as a dry-run instead.
        </p>

        {jobs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No migration jobs yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Started</th>
                  <th className="px-3 py-2 text-left font-medium">Mode</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Candidates</th>
                  <th className="px-3 py-2 text-left font-medium">Migrated</th>
                  <th className="px-3 py-2 text-left font-medium">Failed</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-border/60">
                    <td className="px-3 py-3 text-muted-foreground">{new Date(job.started_at).toLocaleString()}</td>
                    <td className="px-3 py-3">{toTitleCase(job.mode)}</td>
                    <td className="px-3 py-3">{toTitleCase(job.status)}</td>
                    <td className="px-3 py-3">{job.candidate_count}</td>
                    <td className="px-3 py-3 text-emerald-600">{job.migrated_count}</td>
                    <td className="px-3 py-3 text-red-600">{job.failed_count}</td>
                    <td className="px-3 py-3">
                      <Button variant="outline" className="rounded-full" onClick={() => void viewJob(job.id)}>
                        View Items
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedJobId ? (
          <div className="mt-4 rounded-2xl border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground">Items for job {selectedJobId}</p>
            {selectedJobItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No items recorded.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {selectedJobItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/35 px-3 py-2 text-xs">
                    <span className="truncate">{item.visit_evidence_id}</span>
                    <span className={item.status === "verified" ? "text-emerald-600" : item.status === "failed" ? "text-red-600" : "text-muted-foreground"}>
                      {toTitleCase(item.status)}{item.error ? ` — ${item.error}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="font-semibold">Purge Verified Supabase Originals</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Deletes the Supabase copy only for evidence already verified on R2, and only once it&apos;s older than the grace period below. Always run the dry-run first.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            value={purgeDays}
            onChange={(e) => setPurgeDays(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">days grace period</span>
          <Button variant="outline" className="rounded-full" disabled={purging} onClick={() => void runPurge(true)}>
            {purging ? "Working…" : "Preview (dry-run)"}
          </Button>
          <Button
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={purging}
            onClick={() => void runPurge(false)}
          >
            {purging ? "Working…" : "Purge Now"}
          </Button>
        </div>
      </section>
    </div>
  );
}
