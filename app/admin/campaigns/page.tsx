"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef, type RowAction } from "@/components/shared/DataTable";
import { authorizedFetch } from "@/lib/api/client";
import { useTerminology } from "@/components/providers/tenant-experience-provider";

type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  campaign_type?: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "completed";
  state?: string | null;
  lga?: string | null;
  assigned_reps_count?: number;
  visits_count?: number;
  conversions_count?: number;
  conversion_rate?: number;
  last_activity_at?: string | null;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-primary/10 text-primary"
      : status === "draft"
      ? "bg-muted text-muted-foreground"
      : "bg-secondary text-secondary-foreground";
  return <Badge className={`rounded-full capitalize hover:bg-inherit ${cls}`}>{status}</Badge>;
}

export default function CampaignsPage() {
  const t = useTerminology();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () =>
      authorizedFetch<{ success: boolean; campaigns?: Campaign[] }>("/api/admin/campaigns").then(
        (r) => r.campaigns ?? []
      ),
  });

  const columns: ColumnDef<Campaign>[] = [
    {
      key: "name",
      header: t("campaign"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.campaign_type ?? row.description ?? "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "territory",
      header: "Territory",
      render: (row) => (
        <span className="text-muted-foreground">
          {[row.lga, row.state].filter(Boolean).join(", ") || "-"}
        </span>
      ),
    },
    {
      key: "timeline",
      header: "Timeline",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.start_date ?? "-"} → {row.end_date ?? "-"}
        </span>
      ),
    },
    {
      key: "reps",
      header: `${t("agents")}`,
      align: "right",
      width: "w-20",
      render: (row) => (
        <span className="font-medium">{row.assigned_reps_count ?? 0}</span>
      ),
    },
    {
      key: "visits",
      header: t("visits"),
      align: "right",
      width: "w-20",
      sortable: true,
      render: (row) => <span className="font-medium">{row.visits_count ?? 0}</span>,
    },
    {
      key: "conversions",
      header: t("conversions"),
      align: "right",
      width: "w-24",
      sortable: true,
      render: (row) => <span className="font-medium">{row.conversions_count ?? 0}</span>,
    },
    {
      key: "rate",
      header: `${t("conversion")} Rate`,
      align: "right",
      width: "w-28",
      sortable: true,
      render: (row) => (
        <span className="font-medium">{(row.conversion_rate ?? 0).toFixed(1)}%</span>
      ),
    },
    {
      key: "last_activity",
      header: "Last Activity",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.last_activity_at
            ? new Date(row.last_activity_at).toLocaleDateString()
            : "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const actions: RowAction<Campaign>[] = [
    {
      label: "View details",
      onClick: (row) => router.push(`/admin/campaigns/${row.id}`),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("campaigns")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, monitor, and manage field activation {t("campaigns").toLowerCase()}.
          </p>
        </div>
        <Button asChild className="rounded-full px-5">
          <Link href="/admin/campaigns/new">Create {t("campaign")}</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="mb-5">
          <h2 className="font-medium">All {t("campaigns")}</h2>
          <p className="text-sm text-muted-foreground">
            Track {t("campaign").toLowerCase()} setup, progress, and performance.
          </p>
        </div>

        <DataTable
          columns={columns}
          data={query.data ?? []}
          rowKey={(row) => row.id}
          actions={actions}
          loading={query.isLoading}
          emptyTitle={`No ${t("campaigns").toLowerCase()} yet`}
          emptyDescription={`Create your first ${t("campaign").toLowerCase()} to start tracking field activity.`}
        />
      </section>
    </div>
  );
}
