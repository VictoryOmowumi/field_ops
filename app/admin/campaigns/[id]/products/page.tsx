"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabase/client";

type Product = { sku?: string; name?: string; price?: number | null };

export default function CampaignProductsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabaseClient.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/admin/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      setLoading(false);
      if (!response.ok || !result.success || !result.campaign) return;
      setProducts(Array.isArray(result.campaign.products) ? result.campaign.products : []);
    }
    void load();
  }, [campaignId]);

  function addProduct() {
    setProducts((prev) => [...prev, { sku: "", name: "", price: null }]);
  }

  function updateProduct(index: number, key: keyof Product, value: string) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, [key]: key === "price" ? (value ? Number(value) : null) : value } : p)));
  }

  async function save() {
    setSaving(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ products }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to save products.");
      return;
    }
    toast.success("Products updated.");
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaign Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">SKU list available to agents in this campaign.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild><Link href={`/admin/campaigns/${campaignId}`}>Back to Campaign</Link></Button>
      </div>
      <section className="rounded-4xl bg-card p-5 shadow-sm ring-1 ring-border/60 space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading products...</p> : null}
        {products.map((product, index) => (
          <div key={`product-${index}`} className="grid gap-3 rounded-3xl bg-muted/35 p-4 md:grid-cols-3">
            <Input placeholder="SKU" value={product.sku ?? ""} onChange={(e) => updateProduct(index, "sku", e.target.value)} />
            <Input placeholder="Product name" value={product.name ?? ""} onChange={(e) => updateProduct(index, "name", e.target.value)} />
            <Input type="number" placeholder="Price" value={product.price ?? ""} onChange={(e) => updateProduct(index, "price", e.target.value)} />
          </div>
        ))}
        <div className="flex justify-between">
          <Button type="button" variant="outline" className="rounded-full" onClick={addProduct}>Add Product</Button>
          <Button type="button" className="rounded-full px-6" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Products"}</Button>
        </div>
      </section>
    </div>
  );
}

