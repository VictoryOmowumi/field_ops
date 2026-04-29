import KpiCard from "@/components/dashboard/KpiCard";

export default function AdminDashboardPage() {
  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Visits" value="0" />
        <KpiCard label="Total Conversions" value="0" />
        <KpiCard label="Conversion Rate" value="0%" />
        <KpiCard label="Pending Sync" value="0" />
      </div>
    </main>
  );
}
