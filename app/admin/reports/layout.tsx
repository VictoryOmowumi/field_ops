import type { ReactNode } from "react";
import ModuleRouteGuard from "@/components/tenant/ModuleRouteGuard";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <ModuleRouteGuard module="reports">{children}</ModuleRouteGuard>;
}
