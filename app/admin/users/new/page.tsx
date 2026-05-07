"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseClient } from "@/lib/supabase/client";

export default function NewUserPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"org_admin" | "supervisor" | "agent">("agent");
  const [submitting, setSubmitting] = useState(false);

  async function inviteUser() {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Full name and email are required.");
      return;
    }

    setSubmitting(true);
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setSubmitting(false);
      toast.error("Session expired. Please sign in again.");
      router.replace("/login");
      return;
    }

    const response = await fetch("/api/admin/users/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fullName,
        email,
        phone: phone || undefined,
        role,
      }),
    });

    const result = (await response.json()) as { success: boolean; message?: string };
    setSubmitting(false);

    if (!response.ok || !result.success) {
      toast.error(result.message ?? "Failed to invite user.");
      return;
    }

    toast.success("Invite sent successfully.");
    router.push("/admin/users");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Invite User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create profile and send invite for password setup.</p>
        </div>
        <Button variant="outline" className="rounded-full" asChild>
          <Link href="/admin/users">Cancel</Link>
        </Button>
      </div>

      <section className="rounded-4xl bg-card p-6 shadow-sm ring-1 ring-border/60 space-y-4">
        <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Select value={role} onValueChange={(value: "org_admin" | "supervisor" | "agent") => setRole(value)}>
          <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="org_admin">Organization Admin</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex justify-end">
          <Button className="rounded-full px-6" onClick={inviteUser} disabled={submitting}>
            {submitting ? "Sending Invite..." : "Send Invite"}
          </Button>
        </div>
      </section>
    </div>
  );
}

