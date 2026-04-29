import OutletForm from "@/components/forms/OutletForm";
import SectionHeader from "@/components/agent/SectionHeader";

export default function NewOutletPage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader
        title="Register Outlet"
        subtitle="Capture outlet details with location metadata."
      />
      <OutletForm />
    </main>
  );
}
