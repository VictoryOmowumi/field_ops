"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ActivationBlockedReason =
  | "no_billing_account"
  | "organization_suspended"
  | "no_activation_record"
  | "pending_commercial_approval"
  | "activation_rejected"
  | "activation_expired"
  | "outstanding_invoices";

const REASON_COPY: Record<ActivationBlockedReason, { headline: string; detail: string }> = {
  no_billing_account: {
    headline: "No commercial account on file",
    detail: "We couldn't find a commercial account for your organization. Contact support to get this set up before activating campaigns.",
  },
  organization_suspended: {
    headline: "Account currently suspended",
    detail: "Your organization's commercial account is suspended. Reach out to your account manager to resolve this before activating campaigns.",
  },
  no_activation_record: {
    headline: "Missing commercial approval record",
    detail: "This campaign doesn't have a commercial approval record yet. Contact support to have this looked into.",
  },
  pending_commercial_approval: {
    headline: "Awaiting commercial approval",
    detail: "This campaign is awaiting commercial approval from our team before it can go active. You'll be able to activate it as soon as it's cleared — no action needed from you in the meantime.",
  },
  activation_rejected: {
    headline: "Activation not approved",
    detail: "This campaign's commercial approval was not granted. Review the feedback from your account manager, make any needed changes, and it can be resubmitted for approval.",
  },
  activation_expired: {
    headline: "Commercial approval expired",
    detail: "This campaign's commercial approval window has lapsed. Contact your account manager to have it re-cleared before activating.",
  },
  outstanding_invoices: {
    headline: "Outstanding invoice on this campaign",
    detail: "There's an unpaid invoice tied to this campaign's activation. Settling it will clear this campaign to go active.",
  },
};

export default function CampaignActivationBlocked({
  reason,
  onOpenChange,
}: {
  reason: ActivationBlockedReason | null;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = reason ? REASON_COPY[reason] : null;

  return (
    <Dialog open={Boolean(reason)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activation requires commercial approval</DialogTitle>
          <DialogDescription>
            {copy?.headline ?? "This campaign can't be activated right now."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{copy?.detail}</p>
          <p className="text-muted-foreground">
            Nothing else about this campaign is affected — it stays in Draft, you can keep editing
            it, and all your other campaigns, reports, and evidence remain fully accessible.
          </p>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href="/admin/billing">View Billing</Link>
          </Button>
          <DialogClose asChild>
            <Button className="rounded-full">Got it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
