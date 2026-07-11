# Commercial Lifecycle, Billing & R2 Archival — Phase-by-Phase Build Plan

**Implementation Roadmap · ActivationIQ**

Ten production-safe phases from the [domain-model blueprint](./commercial-licensing-architecture.md) to a fully commercially-gated, tiered-storage platform. Every phase deployable on its own, with existing organizations unaffected until the phase that deliberately changes behavior.

| | |
|---|---|
| **Repo** | field_ops |
| **Branch** | feat/agents-offline-functionality |
| **Status** | Live production system — active orgs, completed campaigns |
| **Scope** | No code in this pass — plan only |

## Guardrails — every phase, every PR

- Backward compatible with every live organization
- Existing orgs/campaigns grandfathered, never retroactively blocked
- Historical campaigns, reports, evidence stay reachable
- Offline sync path untouched unless the phase says otherwise
- Tenant isolation preserved — manual `organization_id` filtering on every new route
- Additive schema changes only — `create table if not exists`, `add column if not exists`
- Feature flags default OFF; enforcement is opt-in, never a silent flip
- Each phase independently revertible without touching the phases before it

## Phase map

| # | Phase | Risk | Flag state | Depends on | Effort |
|---|---|---|---|---|---|
| 1 | Commercial Foundation | Low | n/a — no behavior | — | 3–4 days |
| 2 | Commercial Services | Low | OFF | Phase 1 | 5–7 days |
| 3 | Super Admin Commercial Console | Low | OFF | Phase 2 | ~2 weeks |
| 4 | Organization Billing Portal | Low | OFF | Phase 2 (parallel w/ 3) | ~1.5 weeks |
| 5 | Commercial Activation Gate | **High** | ON — test orgs only | Phases 2, 3, 4 | ~1 week + soak |
| 6 | Storage Abstraction | Medium | n/a — refactor | — (parallel track) | ~1 week |
| 7 | Cloudflare R2 (dual-provider) | Medium | OFF (Supabase default) | Phase 6 | ~1 week |
| 8 | Campaign Archival | Medium | OFF | Phase 1 | ~1.5 weeks |
| 9 | Media Migration | **High** | OFF, dry-run first | Phases 7, 8 | ~2 weeks + batch runtime |
| 10 | Payment Integrations | Medium | Manual only, per-org opt-in | Phase 2 | ~2 weeks |

Phases 6–7 and 10 are independent tracks — they can run in parallel with 3–5 rather than strictly after them.

## Feature-flag mechanism (used throughout)

No flag service exists in this codebase today — the closest analogue is the global `platform_settings` key/value table plus the per-org `organizations.experience_config` JSONB blob. Rather than inventing a new system, every phase below reuses that shape. Flags are namespaced per capability rather than one monolithic switch, so activation, archival, and payments can each roll out — and roll back — on their own schedule:

| Flag | Scope | Mechanism |
|---|---|---|
| `commercial.activation.enabled` | Global kill-switch | `platform_settings` row, default `'false'` — Phase 5 |
| `billing_accounts.gating_override` | Per-org override | Nullable boolean — `null` inherits the global activation flag, `true`/`false` forces on/off. Gives exact "test orgs only" targeting in Phase 5. The only flag with a per-org override; the others below are global kill-switches with a dry-run/soak step instead. |
| `default_storage_provider` | Global default (operational, not commercial) | `platform_settings` row, `supabase \| r2` — which backend *new uploads* use; per-file override already lives on `visit_evidence.storage_provider`. Deliberately separate from the flags below: this picks a backend, it doesn't gate a commercial behavior. |
| `commercial.archive.enabled` | Global kill-switch | `platform_settings` row — Phase 8's archival scheduler |
| `commercial.storage.enabled` | Global kill-switch | `platform_settings` row, plus a required `--dry-run` mode on the job itself — Phase 9's R2 migration |
| `commercial.payments.enabled` | Global kill-switch | `platform_settings` row — master switch for automated (Stripe/Paystack) payment processing being live at all, independent of any single org's provider choice — Phase 10 |
| `billing_accounts.payment_provider` | Per-org | Enum, default `'manual'` — which provider connection an org uses; see `payment_provider_connections`, Phase 10 |

---

## Phase 1 — Commercial Foundation

**Risk: Low · Flag: n/a, no behavior change**

Schema, backfill, and a repository layer. Nothing reads these tables yet outside of tests — this phase is invisible to every organization.

**Objectives**
- Stand up the commercial domain tables
- Grandfather every existing org and campaign
- Provide a typed repository layer for later phases to build on

**Database**
- `billing_accounts`, `payment_provider_connections`, `campaign_activations`, `campaign_activation_history`, `campaign_invoices`, `campaign_invoice_line_items`, `infrastructure_allocations` — seven new tables, additive, RLS mirrors `is_super_admin()`/`is_org_member()`. `infrastructure_allocations` anchors on `organization_id` (required) with `campaign_activation_id` optional, so org-pooled resources don't force a fake campaign link.
- Widen `campaigns.status` check constraint to add `archived`, `cancelled` (unused until Phase 8, but the constraint change is safest done once, early, while risk is zero).
- Backfill: one `billing_accounts` row per existing org (`implementation_fee_status='paid'`, `account_status='in_good_standing'`); one `campaign_activations` row per existing campaign (`activation_status='approved'`) with a matching `campaign_activation_history` row (`to_status='approved'`, reason: `"grandfathered — pre-commercial-launch"`).

**Backend**
- `lib/billing/repository.ts` — typed CRUD over the seven tables, no business logic
- No route changes

**Frontend / Super Admin:** None.

**API changes:** None exposed.

**Feature flags:** Not applicable — no code path reads these tables yet, so there's nothing to flag.

**Risks**
- Backfill script miscounts or skips an org/campaign → reconciliation query (count orgs vs. count billing_accounts) before closing the phase.
- Constraint widening rejected by an in-flight write with an unexpected status value → run during low-traffic window, existing values are a strict subset so this is precautionary only.

**Rollback strategy:** Drop the seven new tables (no other code references them yet); revert the constraint widening migration. Zero user-facing impact either way.

**Testing plan**
- Migration idempotency (run twice, no errors)
- Backfill count reconciliation against live org/campaign counts
- RLS policy test: super admin full access, org member read-only, cross-org denied

**Deployment checklist**
- [ ] Migration reviewed for additive-only changes
- [ ] Backfill dry-run against staging snapshot
- [ ] Row counts reconciled post-backfill
- [ ] No application code deployed that reads these tables

**Acceptance criteria**
- [ ] Every existing org has exactly one `billing_accounts` row
- [ ] Every existing campaign has exactly one `campaign_activations` row, `approved`
- [ ] All existing product behavior unchanged (smoke test login, campaign CRUD, evidence upload)

---

## Phase 2 — Commercial Services

**Risk: Low · Flag: OFF**

The domain services that everything downstream calls. All callable internally and unit-tested; none are wired into a live request path yet.

**Objectives**
- One eligibility seam that campaign code will eventually call
- Activation, invoice, and allocation lifecycles as services, not scattered queries
- A manual-approval domain that doesn't assume any payment provider

**Database:** None beyond Phase 1. Services read/write the existing seven tables only.

**Backend**
- `lib/billing/eligibility.ts` — `checkCampaignActivationEligibility(organizationId, campaignId) → { eligible, reason, blockingInvoiceIds? }`
- `lib/billing/activation-service.ts` — create/approve/reject a `CampaignActivation`; every transition writes a `campaign_activation_history` row *and* calls `writePlatformAuditLog` — the history table is the product-facing timeline, the audit log is the security/compliance trail, and they're allowed to overlap rather than trying to be one table.
- `lib/billing/invoice-service.ts` — create/list/mark-paid invoices as header + `campaign_invoice_line_items`; provider-agnostic (payment method is a field, not a branch); no pricing logic reaches into `CampaignActivation`.
- `lib/billing/allocation-service.ts` — open/close `InfrastructureAllocation` windows, org-anchored with optional campaign attribution.

**Frontend:** None. **Super Admin:** None yet — Phase 3 is the UI over these services.

**API changes:** None exposed externally yet — services are called only from integration tests in this phase.

**Feature flags:** `commercial.activation.enabled` introduced in `platform_settings`, defaulted `'false'`. Nothing consults it yet — it exists so Phase 3–5 don't need a schema change to use it.

**Risks:** Eligibility logic encodes an assumption that turns out wrong once real data (Phase 3) exercises it → mitigate by writing the service against the Phase 1 backfilled data as its first test fixture, not synthetic data.

**Rollback strategy:** Delete the service files; nothing else in the app imports them yet.

**Testing plan**
- Unit tests per service against Phase 1's grandfathered fixtures (must all report `eligible: true`)
- Unit tests against synthetic "past_due" and "pending_approval" fixtures (must report `eligible: false` with the correct reason)
- No campaign code imports billing services, and no billing service imports campaign types — enforced by an import-boundary lint rule if the repo's lint config supports it

**Deployment checklist**
- [ ] Services covered by unit tests, including grandfathered-org fixtures
- [ ] `commercial.activation.enabled` row present, defaulted false
- [ ] No route or page imports the new services

**Acceptance criteria**
- [ ] Eligibility service returns `eligible: true` for 100% of grandfathered orgs/campaigns
- [ ] Services have zero coupling to campaign-layer code (verified by import graph)

---

## Phase 3 — Super Admin Commercial Console

**Risk: Low · Flag: OFF**

Read/write UI over Phase 2's services, restricted to `super_admin` — the same role gate already used across `app/super-admin/**`. Nothing here can affect an org's ability to operate.

**Objectives**
- Give the commercial team a working console before any org-facing behavior changes
- Prove the domain model against real, not synthetic, org data

**Database:** None beyond Phase 1.

**Backend**
- `app/api/platform/billing/accounts/route.ts` — list/search billing accounts, outstanding balances
- `app/api/platform/billing/activations/route.ts` + `[id]/approve`, `[id]/reject`
- `app/api/platform/billing/invoices/route.ts` — create/list, mark paid (manual + bank-transfer confirmation)
- `app/api/platform/billing/allocations/route.ts` — view active allocations per org

**Frontend:** None outside Super Admin.

**Super Admin**
- `app/super-admin/billing/accounts` — list + detail
- `app/super-admin/billing/approvals` — the `pending_approval` queue
- `app/super-admin/billing/invoices` — invoice + payment history, manual recording
- Storage/retention visibility reusing the existing usage-stats aggregation in `app/api/platform/organizations/[id]/route.ts`

**API changes:** All new routes above, all `super_admin`-gated via `requireSuperAdmin`, same pattern as every existing `app/api/platform/**` route.

**Feature flags:** None needed — this UI is additive and restricted to an internal role; it doesn't touch org-facing behavior regardless of `commercial.activation.enabled`.

**Risks:** Console surfaces incorrect data because Phase 1's backfill had a gap → treat any console discrepancy found here as a Phase 1 bug, fix the backfill, don't patch around it in the UI.

**Rollback strategy:** Remove the routes and pages; no data was mutated by anyone outside the internal team during this phase, so there's nothing to unwind.

**Testing plan**
- Manual QA by the commercial/ops team against real (grandfathered) org data
- Approve/reject actions write to `platform_audit_logs` — verify entries appear correctly
- Access control test: non-super-admin gets 403 on every new route

**Deployment checklist**
- [ ] All routes verified `super_admin`-only
- [ ] Audit logging confirmed on approve/reject/invoice actions
- [ ] Ops team walkthrough completed before sign-off

**Acceptance criteria**
- [ ] Ops team can find, approve, and invoice a real org end-to-end without engineering help
- [ ] No non-super-admin route access possible

---

## Phase 4 — Organization Billing Portal

**Risk: Low · Flag: OFF**

The org-facing mirror of Phase 3 — read-mostly, and still with zero enforcement. Organizations can see their commercial standing before it's ever able to block them.

**Objectives:** Transparency before enforcement — no org should see a block in Phase 5 they couldn't have anticipated here.

**Database:** None beyond Phase 1.

**Backend:** `app/api/admin/billing/route.ts` — org-scoped read of own billing account, invoices, activation statuses, allocations (filtered by `membership.organizationId`, same pattern as every existing `app/api/admin/**` route).

**Frontend**
- `app/admin/billing` — dashboard: outstanding balance, invoice list, payment history
- Per-campaign activation status shown alongside operational status (read-only at this stage)
- Storage usage + retention information, reusing the same aggregation as Phase 3

**Super Admin:** None new.

**API changes:** `app/api/admin/billing/route.ts`, gated by existing `hasRequiredRole(["admin","super_admin"])` + org membership, mirroring every other admin route.

**Feature flags:** None — read-only, informational, safe regardless of gating state.

**Risks:** Org admins see "Awaiting Approval" language before Phase 5 can act on it and get confused → ship with explicit copy: "informational — does not yet affect campaign activation" until Phase 5 ships, then remove the caveat.

**Rollback strategy:** Remove the route and page; no writes happen from this surface.

**Testing plan**
- Cross-org access test: org A cannot see org B's billing data
- UI review with a real org admin for clarity of copy

**Deployment checklist**
- [ ] Cross-tenant isolation verified on the new route
- [ ] Copy reviewed to avoid implying enforcement that doesn't exist yet

**Acceptance criteria**
- [ ] An org admin can view their own billing standing and invoice history unaided
- [ ] No org can view another org's billing data

---

## Phase 5 — Commercial Activation Gate

**Risk: High · Flag: ON — test orgs only**

The first phase that changes behavior. Wired into the single existing choke point — `app/api/admin/campaigns/[id]/route.ts:162-169` — where every activation already funnels through today.

**Objectives**
- Block only the Draft → Active transition; nothing else
- Every organization retains create, edit, login, reports, evidence, export, user management

**Database:** None beyond Phase 1's `gating_override` column, already present.

**Backend**
- At the existing `status === "active"` / `action === "launch"` branch: call `checkCampaignActivationEligibility()` before mutating status
- Ineligible → `409` with structured `{ reason, blockingInvoiceIds }`, not a bare 403
- Campaign creation (`app/api/admin/campaigns/route.ts`) explicitly untouched — still defaults to Draft, no gate on create

**Frontend**
- `CampaignActivationBlocked` component — professional messaging: what's outstanding, next steps, invoice reference, contact information
- Draft/edit flows unchanged; only the Activate action can surface the blocked state

**Super Admin:** Approval queue (Phase 3) becomes load-bearing for the first time — approving here is what flips `activation_status` to `approved` and unblocks the org.

**API changes:** `app/api/admin/campaigns/[id]/route.ts` — eligibility check inserted at the existing status-transition branch, gated by `commercial.activation.enabled` AND `billing_accounts.gating_override`.

**Feature flags:** Global flag stays `false`. Enable via `gating_override = true` on 2–3 designated internal test organizations only. No org outside that list can be affected no matter what else ships in this phase.

**Risks**
- Eligibility bug blocks a legitimate activation → dry-run/log-only mode ships first (logs what *would* block, blocks nothing) for one full sprint before flipping enforcement on for test orgs.
- Confusing UX if the blocked screen doesn't explain next steps clearly → review copy with the commercial/ops team before enabling for any org, test or otherwise.

**Rollback strategy:** Flip `gating_override` back to `false`/`null` for the affected org(s), or flip `commercial.activation.enabled` off globally. No schema or data rollback needed — this is purely a runtime check.

**Testing plan**
- Log-only soak period: compare logged "would-block" decisions against what the ops team expects, for at least a week
- Enable for test orgs, verify creation/editing/reporting/evidence unaffected, only Activate blocked
- Verify approval in Super Admin console unblocks the exact org/campaign within one request cycle

**Deployment checklist**
- [ ] Log-only mode run and reviewed for at least one week
- [ ] Blocked-screen copy signed off by ops/commercial
- [ ] `gating_override` confirmed scoped to only the intended test orgs
- [ ] Global flag confirmed still `false` before and after this deploy

**Acceptance criteria**
- [ ] Test orgs blocked only on Activate, nothing else
- [ ] All non-test orgs completely unaffected
- [ ] Approval in console unblocks activation without a redeploy

---

## Phase 6 — Storage Abstraction

**Risk: Medium · Flag: n/a, refactor, no new behavior**

Consolidate four direct `supabase.storage.from("evidence")` call sites behind one interface. Prerequisite for R2 — nothing about storage actually changes yet.

**Objectives:** Single seam for storage operations before a second provider can exist.

**Database:** None yet — metadata columns land in Phase 7 alongside the R2 provider that needs them.

**Backend**
- `lib/storage/provider.ts` — interface: `uploadEvidenceFile`, `getEvidenceSignedUrl`, `deleteEvidenceFile`, `archiveEvidenceFile`, `restoreEvidenceFile`, `migrateEvidenceToArchiveStorage`
- `lib/storage/supabase-provider.ts` — wraps existing behavior exactly, byte-for-byte
- Rewrite call sites to use the interface: `app/api/agent/visits/[id]/evidence/route.ts`, `app/api/agent/submissions/[id]/route.ts`, `app/api/admin/evidence/[id]/route.ts`, `lib/campaign/intelligence.ts`

**Frontend:** None — purely a backend refactor. **Super Admin:** None.

**API changes:** None externally visible — same routes, same request/response shapes, different internals.

**Feature flags:** Not applicable. This is a like-for-like refactor; correctness is verified by tests, not by a flag.

**Risks:** Refactor touches the live evidence-upload path used by agents in the field, including through offline sync (`app/api/agent/sync/batch/route.ts`'s `photo` entity type) → regression-test upload, signed-URL retrieval, and offline sync end-to-end before merging, not just unit tests on the new interface.

**Rollback strategy:** Revert the refactor commit — the interface has one implementation and no behavior change, so this is a straightforward code revert with no data implications.

**Testing plan**
- Byte-for-byte comparison: upload + signed URL retrieval before/after refactor, same file, same result
- Full regression on all four rewritten call sites
- Offline sync end-to-end test (queue a photo, drain, confirm it lands identically to pre-refactor behavior)

**Deployment checklist**
- [ ] All four call sites migrated, none left calling `supabase.storage` directly
- [ ] Evidence gallery and reports verified unaffected
- [ ] Offline sync photo path regression-tested

**Acceptance criteria**
- [ ] Zero remaining direct `supabase.storage.from(...)` calls outside `lib/storage/supabase-provider.ts`
- [ ] No observable change in upload, gallery, or export behavior

---

## Phase 7 — Cloudflare R2 (dual-provider)

**Risk: Medium · Flag: OFF (Supabase remains default)**

A second, working implementation of the Phase 6 interface. No existing file moves — this phase only makes R2 *available*, not used by default.

**Objectives:** Prove R2 works for real uploads and real signed-URL reads before any migration is trusted with production data.

**Database:** `visit_evidence`: add `storage_provider` (`supabase|r2`, default `'supabase'`), `bucket`, `object_key`, `original_path`, `archived_at`, `archive_status`, `checksum`, `campaign_id` (denormalized from `visits.campaign_id`, backfilled once).

**Backend**
- `lib/storage/r2-provider.ts` — S3-compatible SDK, implements the same interface as `supabase-provider.ts`
- Provider resolver: dispatches per-row on `visit_evidence.storage_provider`
- New-upload provider selection via `platform_settings.default_storage_provider`, defaulted `'supabase'`

**Frontend:** Evidence gallery updated to call `getEvidenceSignedUrl(row)` regardless of which provider the row is on — no gallery code branches on provider.

**Super Admin:** None new — archive controls come in Phase 8.

**API changes:** None externally visible; same evidence routes, provider dispatch is internal.

**Feature flags:** `default_storage_provider` stays `'supabase'` platform-wide. R2 is exercised only via a small internal test org or synthetic uploads before Phase 9 needs it for real.

**Risks:** R2 credentials/bucket misconfiguration silently fails uploads → fail loudly in this phase (throw, don't fall back silently to Supabase) since nothing depends on R2 succeeding yet.

**Rollback strategy:** Leave `default_storage_provider` at `'supabase'` (its unchanged default); R2 provider code can sit unused indefinitely with no impact.

**Testing plan**
- Upload + signed URL round-trip against real R2 bucket in staging
- Gallery renders correctly for a mixed set of Supabase-backed and R2-backed test rows
- Tenant isolation test on R2 object keys (same prefixing convention as Supabase)

**Deployment checklist**
- [ ] R2 bucket + credentials provisioned in staging and production
- [ ] New metadata columns backfilled with `storage_provider='supabase'` for all existing rows
- [ ] Gallery verified against mixed-provider fixture data

**Acceptance criteria**
- [ ] A file uploaded with provider forced to `r2` round-trips correctly through the gallery
- [ ] Every existing evidence row still resolves via Supabase, unaffected

---

## Phase 8 — Campaign Archival

**Risk: Medium · Flag: OFF**

Introduces the `archived` campaign state for real, with retention windows and read-only enforcement — but no evidence file actually moves in this phase.

**Objectives**
- Replace "archival = delete" with a genuine, non-destructive archived state
- Make retention windows configurable, not hardcoded

**Database**
- (Constraint already widened in Phase 1) — `campaigns.status` now actually used with `archived`/`cancelled`
- Retention config: per-org override on `billing_accounts.retention_days`, falling back to `platform_settings.default_media_retention_days` (already exists)

**Backend**
- `lib/billing/archival-scheduler.ts` — scheduled job: find `completed` campaigns past retention window, transition to `archived`
- Read-only enforcement: reject PATCH/POST against a campaign whose `status='archived'` (reports/exports/evidence reads remain unaffected — read-only means no further writes, not no access)

**Frontend**
- Retention countdown on completed campaigns (org billing portal + campaign detail)
- "Archived" badge and disabled edit affordances on archived campaigns

**Super Admin:** Archive controls: view upcoming archival dates, manually force-archive or extend retention per campaign.

**API changes**
- `app/api/admin/campaigns/[id]/route.ts` — reject mutating verbs when `status='archived'`, with a clear error, not a generic 500
- New: `app/api/platform/campaigns/[id]/archive` (manual super-admin trigger)

**Feature flags:** `commercial.archive.enabled` in `platform_settings`, default `false`. Ship the scheduler dark, verify its candidate list against real data for a cycle before enabling it to actually transition anything.

**Risks**
- Scheduler archives a campaign an org still needs edit access to (e.g. a late correction) → read-only blocks writes, not reads; super admin can un-archive; retention window should default conservatively (e.g. 90 days) rather than aggressively.
- Read-only enforcement accidentally blocks report generation or evidence gallery reads if the check is too broad → scope the block to mutating campaign/visit/evidence endpoints specifically, verified by the guardrail regression suite.

**Rollback strategy:** Disable `commercial.archive.enabled`; manually revert any incorrectly archived campaign's `status` back to `completed` (no data was moved or deleted, so this is a single-column update).

**Testing plan**
- Scheduler dry-run against production-like data, review candidate list with ops before enabling
- Regression: reports, exports, evidence gallery all verified working against an archived campaign
- Regression: PATCH/POST correctly rejected against archived campaign, GET unaffected

**Deployment checklist**
- [ ] Scheduler run in dry-run/log-only mode for at least one full cycle
- [ ] Read-only enforcement scoped to writes only, verified against reporting/evidence reads
- [ ] Retention default reviewed and approved by ops (recommend 90 days to start)

**Acceptance criteria**
- [ ] A completed campaign past its retention window transitions to archived automatically
- [ ] Reports, exports, and evidence remain fully readable on an archived campaign
- [ ] No write succeeds against an archived campaign

---

## Phase 9 — Media Migration

**Risk: High · Flag: OFF, dry-run mandatory first**

The highest-blast-radius phase — it's the only one that moves real customer data. Runs entirely off the request path.

**Objectives:** Move archived campaigns' evidence from Supabase to R2 without any data loss and without touching live traffic.

**Database:** `evidence_migration_jobs` (one row per batch run: mode, status, started/completed) and `evidence_migration_items` (one row per file: job, source/dest checksum, status) — an immutable manifest, formalizing the same pattern as the existing `evidence_recompression_migration_log` one level further so this high-risk job has its own auditable record rather than leaning solely on `visit_evidence`'s status columns.

**Backend**
- `migrateEvidenceToArchiveStorage()` (Phase 6/7 interface) implemented for real: open a job → per-item copy → checksum compare → mark `verified`/`failed` → only then update `visit_evidence` metadata, leaving the Supabase original in place
- Batched, rate-limited job; `mode='dry_run'` populates the manifest and reports without writing to storage or `visit_evidence`
- Resumable via the manifest — a failed run resumes from whatever's still `pending`, not from zero
- Separate, later job deletes Supabase originals only after an explicit verification pass and grace period — never in the same run as the copy

**Frontend:** None — this is invisible to users; the Phase 7 gallery already reads both providers transparently.

**Super Admin:** Migration job status/progress view; manual re-run of failed batches; rollback trigger.

**API changes:** None — this is a background job, not a request-path feature.

**Feature flags:** `commercial.storage.enabled` global kill-switch, plus a mandatory `mode='dry_run'` pass (no writes) that must be reviewed before the first real (write) run for any batch.

**Risks**
- Silent corruption or loss during copy → checksum verification is non-negotiable; a checksum mismatch halts that row's migration and flags it, it does not proceed.
- Job overwhelms Supabase Storage API and degrades live uploads → rate-limited, batched, scheduled for low-traffic windows.
- Deleting a Supabase original before R2 copy is fully verified → hard rule: deletion is a separate job, run only after a grace period and an independent verification pass, never inline with the copy.

**Rollback strategy:** Because Supabase originals are retained through a grace period, rollback is: flip `storage_provider` back to `'supabase'` for affected rows and halt the job — no data has been lost as long as the deletion step hasn't run.

**Testing plan**
- Dry-run against full production data volume, review candidate list and estimated duration
- Small real batch (single test org's archived campaign) end-to-end, including gallery/report verification post-migration
- Deliberate failure injection mid-batch to verify resume-from-manifest behavior
- Checksum-mismatch injection to verify the row is flagged and halted, not silently skipped

**Deployment checklist**
- [ ] Dry-run reviewed and approved by engineering + ops
- [ ] First real batch limited to a single low-risk org
- [ ] Grace period defined and agreed before any deletion job is scheduled
- [ ] Rollback path tested against a deliberately failed batch

**Acceptance criteria**
- [ ] 100% checksum match between Supabase source and R2 copy for every migrated row
- [ ] Zero live-traffic degradation observed during a migration run
- [ ] Gallery and reports work identically before and after migration for a sampled archived campaign

---

## Phase 10 — Payment Integrations

**Risk: Medium · Flag: manual only, per-org opt-in**

Stripe and Paystack join `ManualProvider` as implementations of one interface. The billing domain (Phase 1–2) does not change at all in this phase — that's the point of having built it provider-agnostic from the start.

**Objectives:** Automate invoice-status updates for orgs that want online payment, without touching the domain model.

**Database:** `billing_accounts.payment_provider` (enum, default `'manual'`) selects which connection an org uses; the connections themselves live in Phase 1's `payment_provider_connections` table, so an org can have a historical Stripe connection and a live Paystack one without either overwriting the other. `campaign_invoices.payment_provider_connection_id` and `.external_reference` already exist from Phase 1.

**Backend**
- `lib/billing/payment-provider.ts` — interface: `createInvoice`, `getPaymentStatus`, `handleWebhook`
- `ManualProvider` (already implicit since Phase 2 — formalized as the default implementation)
- `StripeProvider`, `PaystackProvider` — new, behind the same interface
- `app/api/webhooks/stripe`, `app/api/webhooks/paystack` — verify signature, update `campaign_invoices.status` via `invoice-service.ts` (Phase 2), never touch campaign tables directly

**Frontend:** Org billing portal (Phase 4): "Pay now" action when the org's provider is Stripe/Paystack; unchanged (manual instructions) when provider is `manual`.

**Super Admin:** Reconciliation view: invoices whose provider status disagrees with local state, for manual review.

**API changes:** New webhook routes (above), plus a reconciliation job comparing provider state to local invoice state on a schedule.

**Feature flags:** `commercial.payments.enabled` is the global kill-switch for automated processing existing at all; within that, `billing_accounts.payment_provider` defaults `'manual'` per org — Stripe/Paystack are opt-in per organization, never forced platform-wide.

**Risks**
- Missed or delayed webhook leaves an invoice showing unpaid after money was received → nightly reconciliation job against provider APIs; super admin manual override always available.
- Webhook signature verification bypassed or misconfigured → fail closed (reject unverified webhooks), alert on verification failures.
- Provider-specific logic leaking into the billing domain → enforced by the same import-boundary discipline as Phase 2: `invoice-service.ts` calls the interface, never a concrete provider directly.

**Rollback strategy:** Set the affected org(s) back to `payment_provider='manual'`; disable the webhook route. Existing invoices remain valid regardless of provider — the domain model never depended on which provider created them.

**Testing plan**
- Webhook signature verification tested against both valid and tampered payloads
- End-to-end: create invoice via each provider, simulate payment, verify `campaign_invoices.status` updates correctly
- Reconciliation job tested against a deliberately desynced fixture

**Deployment checklist**
- [ ] Webhook signature verification confirmed fail-closed
- [ ] Reconciliation job scheduled and alerting configured
- [ ] First rollout limited to one or two pilot orgs per provider

**Acceptance criteria**
- [ ] A pilot org can pay an activation fee via Stripe or Paystack and see it reflected without manual intervention
- [ ] No provider-specific code exists outside `lib/billing/payment-provider.ts` and its implementations
