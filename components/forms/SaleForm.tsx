"use client";

import { useState } from "react";

import PhotoCapture from "@/components/forms/PhotoCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type SaleFormConfig = {
  requireProduct?: boolean;
  requireQuantity?: boolean;
  requirePrice?: boolean;
  allowMultipleProducts?: boolean;
  allowSalesCapture?: boolean;
};

type SaleFormValue = {
  outletId: string;
  productId: string;
  quantity: number;
  value?: number;
  notes?: string;
  photo?: File;
};

export default function SaleForm({
  config,
  outlets,
  products,
  loading,
  onSubmit,
}: {
  config?: SaleFormConfig;
  outlets: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  loading?: boolean;
  onSubmit: (value: SaleFormValue) => void;
}) {
  const merged: Required<SaleFormConfig> = {
    requireProduct: true,
    requireQuantity: true,
    requirePrice: false,
    allowMultipleProducts: false,
    allowSalesCapture: true,
    ...(config ?? {}),
  };

  const [selectedPhoto, setSelectedPhoto] = useState<File | undefined>(undefined);
  const [outletId, setOutletId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  if (!merged.allowSalesCapture) {
    return <div className="rounded-3xl border border-border/70 bg-card p-4 text-sm text-muted-foreground">Sales capture is disabled for this campaign.</div>;
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          outletId,
          productId,
          quantity: Number(quantity || "0"),
          value: value ? Number(value) : undefined,
          notes: notes || undefined,
          photo: selectedPhoto,
        });
      }}
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Outlet</label>
        <Select value={outletId} onValueChange={setOutletId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select outlet" /></SelectTrigger>
          <SelectContent>{outlets.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Product / SKU</label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select product SKU" /></SelectTrigger>
          <SelectContent>{products.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Quantity</label>
          <Input type="number" min={1} defaultValue={1} required={merged.requireQuantity} onChange={(e) => { setQuantity(e.target.value); }} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Value (NGN)</label>
          <Input type="number" min={0} defaultValue={0} required={merged.requirePrice} onChange={(e) => { setValue(e.target.value); }} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea placeholder="Add context for supervisor follow-up..." onChange={(e) => { setNotes(e.target.value); }} />
      </div>

      <PhotoCapture onSelect={setSelectedPhoto} />

      <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold" disabled={loading}>
        {loading ? "Saving..." : "Save Sale"}
      </Button>
    </form>
  );
}
