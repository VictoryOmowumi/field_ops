"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type OutletFormConfig = {
  requireOutletName?: boolean;
  requireOutletType?: boolean;
  requireContactPerson?: boolean;
  requirePhone?: boolean;
  requireAddress?: boolean;
  requireGps?: boolean;
};

type OutletFormValue = {
  name: string;
  outletType?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
};

export default function OutletForm({
  config,
  outletTypes,
  loading,
  onCaptureGps,
  gpsCaptured,
  onSubmit,
}: {
  config?: OutletFormConfig;
  outletTypes: string[];
  loading?: boolean;
  onCaptureGps?: () => void;
  gpsCaptured?: boolean;
  onSubmit: (value: OutletFormValue) => void;
}) {
  const merged: Required<OutletFormConfig> = {
    requireOutletName: true,
    requireOutletType: true,
    requireContactPerson: false,
    requirePhone: false,
    requireAddress: false,
    requireGps: true,
    ...(config ?? {}),
  };

  const [name, setName] = useState("");
  const [outletType, setOutletType] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  return (
    <form
      className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          outletType: outletType || undefined,
          contactPerson: contactPerson || undefined,
          phone: phone || undefined,
          address: address || undefined,
        });
      }}
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Outlet Name</label>
        <Input placeholder="Enter outlet name" value={name} onChange={(e) => setName(e.target.value)} required={merged.requireOutletName} />
      </div>

      {merged.requireOutletType ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Outlet Type</label>
          <Select value={outletType} onValueChange={setOutletType}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select outlet type" /></SelectTrigger>
            <SelectContent>
              {outletTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium">Contact Person</label>
        <Input placeholder="Enter contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required={merged.requireContactPerson} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Phone Number</label>
        <Input placeholder="+234..." value={phone} onChange={(e) => setPhone(e.target.value)} required={merged.requirePhone} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Textarea placeholder="Street, landmark" value={address} onChange={(e) => setAddress(e.target.value)} required={merged.requireAddress} />
      </div>

      {merged.requireGps ? (
        <div className="rounded-2xl border border-border/70 bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">GPS Location</p>
          <p className="mt-1 text-sm font-medium">{gpsCaptured ? "Location captured" : "No location captured yet"}</p>
          <Button type="button" variant="outline" className="mt-3 h-11 rounded-xl" onClick={onCaptureGps}>Capture Location</Button>
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold" disabled={loading}>
        {loading ? "Saving..." : "Save Outlet"}
      </Button>
    </form>
  );
}

