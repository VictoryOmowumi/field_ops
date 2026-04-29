type OfflineBannerProps = {
  isOnline: boolean;
};

export default function OfflineBanner({ isOnline }: OfflineBannerProps) {
  if (isOnline) {
    return null;
  }

  return (
    <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-900">
      You are offline. New records will be queued and synced automatically when connectivity returns.
    </div>
  );
}
