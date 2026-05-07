# ActivationIQ Platform

Mobile-first, offline-first field activation platform for FMCG and distribution operations.

## Problem

Most field campaigns still run on fragmented tools: spreadsheets, chat apps, delayed summaries, and manual slide reports.  
This makes real-time operational visibility difficult.

Common operational gaps:
- Which outlets were actually visited?
- Which reps were active?
- Where did activities happen?
- What products were sold or promoted?
- Was campaign evidence captured correctly?
- How fast can performance be reviewed?

## Opportunity

ActivationIQ provides a structured system for executing and monitoring campaigns from one platform, instead of stitching reports after the fact.

Core outcomes:
- Structured field execution
- Faster reporting
- Operational visibility
- Reusable activation infrastructure
- Simpler campaign management

## Platform Layers

### 1. Super Admin Layer
- Onboard and manage organizations
- Platform-level monitoring and support
- Global policies and governance

### 2. Organization Admin Layer
- Manage campaigns, reps, products, outlets
- Monitor execution performance
- Review campaign dashboards and sync health

### 3. Agent Mobile Layer
- Register outlets
- Capture sales/conversions
- Upload geo-tagged photo evidence
- Work offline and sync when online

## Product Philosophy

This product is not positioned as surveillance tooling.  
It is built for operational efficiency, coordination, and timely reporting.  
Accountability is an outcome of better workflows.

## MVP Scope (Current Build Priority)

Agent mobile MVP first:
- Secure authentication and role-based route access
- Outlet registration with GPS capture
- Sales/conversion capture
- Mandatory image evidence for outlet and sale records
- IndexedDB local persistence (Dexie)
- Sync queue with retry and status transitions
- Basic admin operational dashboard

## Non-Goals (MVP)

- Advanced commission engine
- Real-time continuous tracking
- Push notifications
- Complex conflict resolution
- Full BI dashboard suite
- Native mobile app

## Mandatory Evidence Rule

For this project, photo evidence is required for:
- Outlet registration
- Sale/conversion submission

Records without image evidence must fail validation and must not sync as successful records.

## Architecture and Stack

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI: shadcn/ui + lucide-react
- Forms: react-hook-form + zod
- Offline DB: IndexedDB (Dexie)
- Backend/Auth: Supabase
- Storage: Supabase Storage or Cloudflare R2
- Charts: Recharts
- Notifications: Sonner
- Deployment: Vercel

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local` in project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

### 3. Run the app

```bash
npm run dev
```

### 4. Quality checks

```bash
npm run lint
npm run build
```

## Role Model

Supported roles:
- `agent`
- `admin`
- `super_admin`

Auth guards expect role metadata in Supabase user metadata (`app_metadata.role` preferred, `user_metadata.role` fallback).

## Sprint Plan

Implementation roadmap is tracked in:
- [SPRINT-PHASES.md](/c:/Users/victory.balogun/Desktop/project/activationiq/SPRINT-PHASES.md)

Current execution order:
1. Agent auth and guarded routes
2. Outlet capture with mandatory photo + GPS + offline save
3. Sales capture with mandatory photo + GPS + offline save
4. Queue integrity and reliable sync
5. Admin dashboard essentials
6. Super admin platform controls

## Vision

Build reusable field operations infrastructure that organizations can repeatedly use to launch, monitor, and report campaigns without rebuilding operational processes every cycle.

