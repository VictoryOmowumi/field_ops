import type { ReactNode } from "react";
import RequireRole from "@/components/auth/RequireRole";
import AppQueryProvider from "@/components/providers/AppQueryProvider";
import TenantShell from "@/components/shell/TenantShell";
import TenantDebugPanel from "@/components/dev/TenantDebugPanel";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole
      allowedRoles={["admin", "super_admin"]}
      allowedOrgRoles={["org_admin", "supervisor"]}
      redirectOnOrgDeniedTo="/admin/unauthorized"
    >
      <AppQueryProvider liveMode>
        <TenantShell role="admin">{children}</TenantShell>
        {process.env.NODE_ENV !== "production" ? <TenantDebugPanel /> : null}
      </AppQueryProvider>
    </RequireRole>
  );
}
