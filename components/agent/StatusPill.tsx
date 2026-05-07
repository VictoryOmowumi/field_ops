import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UiConversionStatus, UiSyncStatus } from "@/types/agent-ui";

type StatusValue = UiSyncStatus | UiConversionStatus;

type StatusPillProps = {
  status: StatusValue;
};

const styleByStatus: Record<StatusValue, string> = {
  synced: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  offline: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  converted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  revisit: "bg-slate-500/20 text-slate-700 dark:text-slate-200",
};

export default function StatusPill({ status }: StatusPillProps) {
  const label =
    status === "synced"
      ? "Saved Online"
      : status === "pending"
        ? "Waiting for Network"
        : status === "failed"
          ? "Sync Failed"
          : status.replace("_", " ");

  return (
    <Badge
      className={cn(
        "rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        styleByStatus[status]
      )}
    >
      {label}
    </Badge>
  );
}
