import type { ReactNode } from "react";
import ModuleRouteGuard from "@/components/tenant/ModuleRouteGuard";

export default function OutletsLayout({ children }: { children: ReactNode }) {
  return <ModuleRouteGuard module="outlets">{children}</ModuleRouteGuard>;
}
