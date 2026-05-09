"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authorizedFetch } from "@/lib/api/client";

type CatalogProduct = {
  name: string;
  brand?: string;
  category?: string;
  industry?: string;
};

type ProductCatalogSelectorProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export default function ProductCatalogSelector({ value, onChange }: ProductCatalogSelectorProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdProducts, setCreatedProducts] = useState<CatalogProduct[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["admin-product-catalog"],
    queryFn: async () => {
      const result = await authorizedFetch<{ success: boolean; products: CatalogProduct[] }>("/api/admin/product-catalog");
      return result.products ?? [];
    },
  });

  useEffect(() => {
    if (catalogQuery.error) toast.error((catalogQuery.error as Error).message);
  }, [catalogQuery.error]);

  const products = useMemo(() => {
    const base = catalogQuery.data ?? [];
    if (createdProducts.length === 0) return base;
    const seen = new Set(base.map((item) => item.name.toLowerCase()));
    return [...base, ...createdProducts.filter((item) => !seen.has(item.name.toLowerCase()))].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [catalogQuery.data, createdProducts]);

  const selectedSet = useMemo(() => new Set(value.map((item) => item.toLowerCase())), [value]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return products.slice(0, 25);
    return products.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 25);
  }, [normalizedQuery, products]);

  const exactMatch = useMemo(
    () => products.some((item) => item.name.toLowerCase() === normalizedQuery),
    [normalizedQuery, products]
  );

  function addProduct(name: string) {
    if (!name.trim()) return;
    if (selectedSet.has(name.toLowerCase())) return;
    onChange([...value, name]);
  }

  function removeProduct(name: string) {
    onChange(value.filter((item) => item !== name));
  }

  async function createProductFromQuery() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await authorizedFetch<{ success: boolean; product: CatalogProduct; alreadyExists?: boolean }>(
        "/api/admin/product-catalog",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      const created = result.product;
      setCreatedProducts((prev) => {
        if (prev.some((item) => item.name.toLowerCase() === created.name.toLowerCase())) return prev;
        return [...prev, created];
      });
      addProduct(created.name);
      setQuery("");
      toast.success(result.alreadyExists ? "Product already existed and was selected." : "Product created and selected.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search products (e.g. Coca-Cola, Indomie, Dettol)"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="rounded-2xl border border-border bg-background p-3">
        {catalogQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading product catalog...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products found.</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-auto">
            {filtered.map((item) => {
              const selected = selectedSet.has(item.name.toLowerCase());
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                  }`}
                  onClick={() => addProduct(item.name)}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[item.brand, item.category, item.industry].filter(Boolean).join(" | ") || "Catalog product"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {query.trim() && !exactMatch ? (
        <Button type="button" variant="outline" className="rounded-full" disabled={creating} onClick={createProductFromQuery}>
          {creating ? "Saving..." : `Add "${query.trim()}" to catalog`}
        </Button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products selected yet.</p>
        ) : (
          value.map((item) => (
            <button key={item} type="button" onClick={() => removeProduct(item)}>
              <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/20">{item} x</Badge>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
