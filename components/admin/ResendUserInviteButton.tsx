"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

export default function ResendUserInviteButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);

  async function onResend() {
    setLoading(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setLoading(false);
      toast.error("Session expired. Please sign in again.");
      return;
    }

    const response = await fetch(`/api/admin/users/${userId}/resend-invite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = (await response.json()) as { success: boolean; message?: string };
    setLoading(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to resend invite.");
      return;
    }

    toast.success(result.message ?? "Invite resent.");
  }

  return (
    <Button variant="outline" className="rounded-full" disabled={loading} onClick={onResend}>
      {loading ? "Resending..." : "Resend Invite"}
    </Button>
  );
}
