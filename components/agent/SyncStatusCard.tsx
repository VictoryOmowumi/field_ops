type SyncStatusCardProps = {
  pending: number;
  synced: number;
  failed: number;
};

export default function SyncStatusCard({ pending, synced, failed }: SyncStatusCardProps) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-medium">Sync Status</h2>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-xl font-semibold text-yellow-600">{pending}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Synced</p>
          <p className="text-xl font-semibold text-green-600">{synced}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-xl font-semibold text-red-600">{failed}</p>
        </div>
      </div>
    </section>
  );
}
