"use client";

import { useState } from "react";
import { toast } from "sonner";

import PhotoCapture from "@/components/forms/PhotoCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function SaleForm() {
  const [outlet, setOutlet] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");

  return (
    <form
      className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!outlet || !product || !status) {
          toast.error("Please select outlet, product, and sale status.");
          return;
        }
        toast.success("Sale saved locally and queued for sync (mock).");
      }}
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Outlet</label>
        <Select value={outlet} onValueChange={setOutlet}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select outlet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bluemart-outlet">BlueMart Outlet</SelectItem>
            <SelectItem value="city-choice-store">City Choice Store</SelectItem>
            <SelectItem value="prime-corner-shop">Prime Corner Shop</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Product / SKU</label>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select product SKU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="energy-drink-35cl">Energy Drink 35cl</SelectItem>
            <SelectItem value="spark-soda-50cl">Spark Soda 50cl</SelectItem>
            <SelectItem value="fruit-mix-1l">Fruit Mix 1L</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Quantity</label>
          <Input type="number" min={1} defaultValue={1} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Value (NGN)</label>
          <Input type="number" min={0} defaultValue={0} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Status</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select conversion status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="revisit">Revisit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea placeholder="Add context for supervisor follow-up..." />
      </div>

      <PhotoCapture
        onSelect={(file) => {
          toast.message(`Photo attached: ${file.name}`);
        }}
      />

      <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
        Save Sale
      </Button>
    </form>
  );
}
