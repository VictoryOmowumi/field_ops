import type { ReactNode } from "react";
import RequireRole from "@/components/auth/RequireRole";
import BackofficeShell from "@/components/backoffice/BackofficeShell";
import AppQueryProvider from "@/components/providers/AppQueryProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["admin", "super_admin"]}
      allowedOrgRoles={["org_admin", "supervisor"]}
      redirectOnOrgDeniedTo="/admin/unauthorized"
    >
      <AppQueryProvider>
        <BackofficeShell role="admin">{children}</BackofficeShell>
      </AppQueryProvider>
    </RequireRole>
  );
}
