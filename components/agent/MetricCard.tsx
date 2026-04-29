import { cn } from "@/lib/utils";

type MetricTone = "blue" | "green" | "amber" | "neutral";

type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
  tone?: MetricTone;
};

const toneStyles: Record<MetricTone, string> = {
  blue: "border-sky-200/80 bg-sky-100 text-sky-950 dark:border-sky-900/60 dark:bg-sky-900/40 dark:text-sky-100",
  green:
    "border-lime-300/80 bg-lime-300 text-lime-950 dark:border-lime-900/60 dark:bg-lime-900/55 dark:text-lime-100",
  amber:
    "border-amber-200/80 bg-amber-100 text-amber-950 dark:border-amber-900/60 dark:bg-amber-900/45 dark:text-amber-100",
  neutral:
    "border-slate-200/80 bg-slate-100 text-slate-950 dark:border-slate-800/70 dark:bg-slate-800/60 dark:text-slate-100",
};

export default function MetricCard({
  label,
  value,
  delta,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        toneStyles[tone]
      )}
    >
      <p className="text-xs/4 opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {delta ? <p className="mt-2 text-xs/4 opacity-75">{delta}</p> : null}
    </div>
  );
}
