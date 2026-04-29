"use client";

import { useState } from "react";
import { toast } from "sonner";

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

export default function OutletForm() {
  const [gpsCaptured, setGpsCaptured] = useState(false);
  const [outletType, setOutletType] = useState("");
  const [territory, setTerritory] = useState("");
  const [channel, setChannel] = useState("");

  return (
    <form
      className="space-y-4 rounded-3xl border border-border/70 bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!outletType || !territory || !channel) {
          toast.error("Please select outlet type, territory, and sales channel.");
          return;
        }
        toast.success("Outlet saved locally (mock).");
      }}
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Outlet Name</label>
        <Input placeholder="Enter outlet name" required />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Outlet Type</label>
        <Select value={outletType} onValueChange={setOutletType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select outlet type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="supermarket">Supermarket</SelectItem>
            <SelectItem value="mini-mart">Mini Mart</SelectItem>
            <SelectItem value="kiosk">Kiosk</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="pharmacy">Pharmacy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Territory / City</label>
       
        <Select value={territory} onValueChange={setTerritory}>
      
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select territory" />
          </SelectTrigger>
      
          <SelectContent>
            <SelectItem value="lagos-mainland">Lagos Mainland</SelectItem>
            <SelectItem value="lagos-island">Lagos Island</SelectItem>
            <SelectItem value="ibadan-north">Ibadan North</SelectItem>
            <SelectItem value="abuja-central">Abuja Central</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Sales Channel</label>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select sales channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="modern-trade">Modern Trade</SelectItem>
            <SelectItem value="general-trade">General Trade</SelectItem>
            <SelectItem value="horeca">HORECA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Contact Person</label>
        <Input placeholder="Enter contact person" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Phone Number</label>
        <Input placeholder="+234..." />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Address</label>
        <Textarea placeholder="Street, city, landmark" />
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">GPS Location</p>
        <p className="mt-1 text-sm font-medium">
          {gpsCaptured ? "Location captured • Accuracy 8m" : "No location captured yet"}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 rounded-xl"
          onClick={() => {
            setGpsCaptured(true);
            toast.message("GPS captured (mock).");
          }}
        >
          Capture Location
        </Button>
      </div>

      <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold">
        Save Outlet
      </Button>
    </form>
  );
}
