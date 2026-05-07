**Milestone Tracker (Sprint-by-Sprint)**
Scope is aligned to your AGENTS.md and updated rule: **image upload is mandatory for both outlet registration and sale capture**.

## Sprint 0: Project Baseline and Execution Setup
**Goal:** establish delivery controls before feature work.

**Deliverables**
- Finalized backlog and sprint board with priorities.
- Environment setup checklist (`.env.local`, Supabase project, storage bucket, RLS plan).
- Definition of Done checklist added to workflow.
- Basic CI checks (`lint`, `build`) passing.

**Acceptance Criteria**
- Repo runs locally with `npm run dev`.
- `npm run lint` and `npm run build` pass.
- Team has documented branch naming and PR checklist.
- MVP scope frozen for agent-first delivery.

---

## Sprint 1: Agent Shell, Navigation, and Auth
**Goal:** secure entry and mobile-first agent app shell.

**Deliverables**
- Agent layout and bottom nav finalized.
- Login form with validation.
- Supabase Auth sign-in/sign-out/session.
- Route guards for `agent` role.
- Redirect handling for unauthenticated users.

**Acceptance Criteria**
- Unauthenticated user cannot access `/agent/*`.
- Valid agent account can log in and reach agent home.
- Non-agent role is blocked from agent routes.
- Loading/error states shown on login attempts.

---

## Sprint 2: Outlet Registration with Mandatory Photo + GPS
**Goal:** production-grade outlet capture flow.

**Deliverables**
- `react-hook-form` + zod outlet form.
- GPS capture with permission/timeout/poor-accuracy handling.
- Mandatory photo input for outlet registration.
- Local save to IndexedDB with `pending_sync`.
- Duplicate outlet guard (basic heuristic).

**Acceptance Criteria**
- Outlet submit is blocked if no image is attached.
- Outlet submit is blocked when required fields are invalid.
- Successful submit creates local outlet record + photo metadata + queue item.
- UI clearly shows success and `pending_sync` status offline/online.

---

## Sprint 3: Sales Capture with Mandatory Photo + GPS
**Goal:** production-grade sale/conversion flow.

**Deliverables**
- Validated sale form (outlet, SKU, qty, value, status, notes).
- Mandatory photo input for sale submission.
- GPS capture on sale submit where available.
- Local save of sale + photo metadata + queue record.

**Acceptance Criteria**
- Sale submit is blocked if no image is attached.
- Sale submit is blocked for invalid qty/status/outlet/SKU.
- Successful submit stores sale locally and marks as `pending_sync`.
- Sale records appear in list with correct sync status.

---

## Sprint 4: Offline Data Layer and Queue Integrity
**Goal:** make offline-first behavior reliable.

**Deliverables**
- Dexie schema finalized for outlets, sales, photos, queue.
- Atomic local writes for entity + queue.
- Client-generated IDs for idempotency.
- Queue read/update/delete utilities hardened.

**Acceptance Criteria**
- App works in airplane mode for outlet + sale capture.
- No data loss on refresh/reopen after offline saves.
- Each saved outlet/sale has valid linked photo metadata.
- Queue accurately reflects pending items.

---

## Sprint 5: Sync Engine + API Contract
**Goal:** reliable record sync from local queue to backend.

**Deliverables**
- Queue processor (`pending_sync -> syncing -> synced/failed`).
- Retry/backoff and retry limits.
- Server sync endpoint validates payloads and idempotency.
- Sync status transitions stored locally and reflected in UI.

**Acceptance Criteria**
- Going online triggers sync automatically.
- Manual “Sync Now” and “Retry Failed” both work.
- Failed items move to `failed` with retry count incremented.
- Duplicate submits do not create duplicate backend records.

---

## Sprint 6: Photo Upload Pipeline and Linking
**Goal:** reliable image upload and record linkage.

**Deliverables**
- Upload images to Supabase Storage or Cloudflare R2.
- Photo compression/size checks before upload.
- Upload queue handling for offline captures.
- Attach `remoteUrl` to corresponding outlet/sale records post-upload.

**Acceptance Criteria**
- Records are not marked `synced` until required image upload succeeds.
- Offline-captured images upload when connectivity returns.
- Failed image uploads are retryable and visible in sync screen.
- Backend records include valid image reference(s).

---

## Sprint 7: Agent Sync Screen, Monitoring UX, and Hardening
**Goal:** operationally usable agent app in field conditions.

**Deliverables**
- Sync screen with pending/synced/failed breakdown and list.
- Clear error messaging and corrective actions.
- Edge-case handling for denied permissions/network flaps.
- Performance polish for low-end devices.

**Acceptance Criteria**
- Agent can identify exactly what failed and retry it.
- Status colors and labels are consistent and readable outdoors.
- No blocking crashes under offline/online transitions.
- End-to-end agent flow works on mobile browser from login to sync.

---

## Sprint 8: Client Admin MVP
**Goal:** minimum operational visibility for business users.

**Deliverables**
- Admin auth/role protection.
- KPI cards: visits, conversions, conversion rate, pending sync.
- Sales/outlet/activity tables with filters.
- Basic sync health overview.

**Acceptance Criteria**
- Admin can view data only when authenticated with admin/supervisor role.
- KPIs reflect synced backend data correctly for selected date range.
- Filters (agent/territory/date) update table/KPI outputs.
- Pending/failed sync indicators are visible.

---

## Sprint 9: Super Admin MVP
**Goal:** platform-level control and governance.

**Deliverables**
- Global user and role management.
- Master data management (SKU, territory, outlet type, channel).
- Platform sync/image policy settings.
- Audit log for privileged actions.

**Acceptance Criteria**
- Super admin can create/update/disable users and assign roles.
- Master data changes are reflected in agent/admin forms.
- Policy changes apply without redeploy.
- Privileged actions are traceable via audit logs.

---

## Release Gate (Go-Live Checklist)
- Agent flow fully functional offline-first with mandatory image proof.
- Sync success rate target met in UAT (define numeric threshold, e.g. `>= 98%`).
- No P1/P2 open defects.
- Auth, role guards, and storage security rules validated.
- Pilot test completed with real agents and sign-off captured.

## Suggested Sprint Cadence
1. Sprint length: `2 weeks`.
2. Demo on last day of each sprint with acceptance checklist sign-off.
3. No carry-over without explicit re-estimation and scope tradeoff.
