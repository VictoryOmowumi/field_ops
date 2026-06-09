"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import UserStatusBadge from "@/components/admin/UserStatusBadge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef, type RowAction } from "@/components/shared/DataTable";
import { authorizedFetch } from "@/lib/api/client";
import { useTerminology } from "@/components/providers/tenant-experience-provider";

type Rep = {
  id: string;
  repCode: string;
  displayName: string;
  phone: string | null;
  territory: string;
  status: string;
  targetOutlets: number | null;
  targetConversions: number | null;
  campaigns: Array<{ id: string; name: string }>;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
};

export default function RepsPage() {
  const t = useTerminology();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["admin-reps"],
    queryFn: () =>
      authorizedFetch<{ success: boolean; reps: Rep[] }>("/api/admin/reps").then(
        (r) => r.reps ?? []
      ),
  });

  if (query.error) toast.error((query.error as Error).message);

  const columns: ColumnDef<Rep>[] = [
    {
      key: "name",
      header: t("agent"),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.displayName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.repCode} · {row.phone ?? "-"}
          </p>
        </div>
      ),
    },
    {
      key: "campaigns",
      header: t("campaigns"),
      render: (row) => (
        <span className="text-muted-foreground">
          {row.campaigns.length ? row.campaigns.map((c) => c.name).join(", ") : "-"}
        </span>
      ),
    },
    {
      key: "territory",
      header: "Territory",
      render: (row) => (
        <span className="text-muted-foreground">{row.territory || "-"}</span>
      ),
    },
    {
      key: "targets",
      header: "Targets",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.targetOutlets ?? "-"} {t("outlets").toLowerCase()} /{" "}
          {row.targetConversions ?? "-"} conv
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: "lastSignIn",
      header: "Last Sign In",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleDateString() : "-"}
        </span>
      ),
    },
    {
      key: "lastActivity",
      header: "Last Activity",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">
          {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleDateString() : "-"}
        </span>
      ),
    },
  ];

  const actions: RowAction<Rep>[] = [
    {
      label: "View profile",
      onClick: (row) => router.push(`/admin/reps/${row.id}`),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sales {t("agents")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage field {t("agents").toLowerCase()} and {t("campaign").toLowerCase()} assignments.
          </p>
        </div>
        <Button asChild className="rounded-full px-5">
          <Link href="/admin/reps/new">Add {t("agent")}</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <DataTable
          columns={columns}
          data={query.data ?? []}
          rowKey={(row) => row.id}
          actions={actions}
          loading={query.isLoading}
          emptyTitle={`No sales ${t("agents").toLowerCase()} found`}
          emptyDescription={`Add ${t("agents").toLowerCase()} to assign them to ${t("campaigns").toLowerCase()} and territories.`}
        />
      </section>
    </div>
  );
}
