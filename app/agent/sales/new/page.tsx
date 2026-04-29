import SaleForm from "@/components/forms/SaleForm";
import SectionHeader from "@/components/agent/SectionHeader";

export default function NewSalePage() {
  return (
    <main className="space-y-4 pt-4">
      <SectionHeader
        title="Record Sale"
        subtitle="Capture conversion, value, notes, and photo evidence."
      />
      <SaleForm />
    </main>
  );
}
