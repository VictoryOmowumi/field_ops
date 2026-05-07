import { Button } from "@/components/ui/button";

const settings = [
  { section: "Sync", label: "Default sync retry attempts", value: "5" },
  { section: "Sync", label: "Offline queue timeout", value: "20 minutes" },
  { section: "Storage", label: "Photo upload max size", value: "8 MB" },
  { section: "Storage", label: "Default media retention", value: "180 days" },
  { section: "Tenant", label: "Default organization status", value: "Active" },
  { section: "Tenant", label: "Global incident alert threshold", value: "3 failed sync windows" },
];

export default function SuperAdminSettingsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Platform Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Global defaults for sync reliability and tenant operations.</p>
        </div>
        <Button className="rounded-full">Edit Settings</Button>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Section</th>
              <th className="px-4 py-3 text-left">Setting</th>
              <th className="px-4 py-3 text-left">Current Value</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((item) => (
              <tr key={item.label} className="border-t border-border">
                <td className="px-4 py-4 font-medium">{item.section}</td>
                <td className="px-4 py-4 text-muted-foreground">{item.label}</td>
                <td className="px-4 py-4">{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
