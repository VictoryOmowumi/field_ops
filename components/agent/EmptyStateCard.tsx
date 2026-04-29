type EmptyStateCardProps = {
  title: string;
  message: string;
};

export default function EmptyStateCard({ title, message }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
