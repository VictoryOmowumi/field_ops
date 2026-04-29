import type { ReactNode } from "react";

import AgentHeader from "@/components/agent/AgentHeader";
import BottomNav from "@/components/agent/BottomNav";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <AgentHeader />
      <div className="flex-1 px-4 pb-24">{children}</div>
      <BottomNav />
    </div>
  );
}
