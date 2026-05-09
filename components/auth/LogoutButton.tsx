"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 focus-visible:ring-red-500/30 disabled:pointer-events-none disabled:opacity-50"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const { error } = await supabaseClient.auth.signOut();
        setLoading(false);
        if (error) {
          toast.error(error.message);
          return;
        }
        router.replace("/login");
      }}
    >
      {loading ? "Signing out..." : "Sign Out"}
    </Button>
  );
}

