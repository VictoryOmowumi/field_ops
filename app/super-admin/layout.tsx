import type { ReactNode } from "react";

import RequireRole from "@/components/auth/RequireRole";
import BackofficeShell from "@/components/backoffice/BackofficeShell";
import AppQueryProvider from "@/components/providers/AppQueryProvider";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole allowedRoles={["super_admin"]}>
      <AppQueryProvider liveMode>
        <BackofficeShell role="super_admin">{children}</BackofficeShell>
      </AppQueryProvider>
    </RequireRole>
  );
}
