import type { SyncStatus } from "@/types/sync";

type AgentState = {
  pendingSyncCount: number;
  lastSyncAt?: string;
  syncStatus: SyncStatus;
};

let state: AgentState = {
  pendingSyncCount: 0,
  syncStatus: "draft",
};

export function getAgentState() {
  return state;
}

export function setAgentState(next: Partial<AgentState>) {
  state = { ...state, ...next };
}
