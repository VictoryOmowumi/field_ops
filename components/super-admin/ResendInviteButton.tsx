"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

export default function ResendInviteButton({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleResendInvite() {
    setLoading(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/platform/organizations/${organizationId}/resend-invite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = (await response.json()) as {
      success: boolean;
      message?: string;
      inviteLink?: string | null;
    };
    setLoading(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to resend invite.");
      return;
    }

    if (result.inviteLink) {
      try {
        await navigator.clipboard.writeText(result.inviteLink);
        toast.success("Invite link copied. Email delivery may not be configured.");
      } catch {
        toast.success(result.message ?? "Invite link generated.");
      }
      return;
    }

    toast.success(result.message ?? "Invite resent.");
  }

  return (
    <Button
      variant="outline"
      className="rounded-full"
      onClick={handleResendInvite}
      disabled={loading}
    >
      {loading ? "Resending..." : "Resend Invite"}
    </Button>
  );
}
