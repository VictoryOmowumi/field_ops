import { Badge } from "@/components/ui/badge";

export default function UserStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "active"
      ? "bg-primary/10 text-primary"
      : normalized === "invited"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      : normalized === "suspended"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";

  return (
    <Badge className={`rounded-full capitalize hover:bg-inherit ${className}`}>
      {status}
    </Badge>
  );
}

