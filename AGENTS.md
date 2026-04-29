# AGENTS.md

## Project Overview

This project is a mobile-first field sales activation web application.

The app allows authenticated sales agents to capture outlet visits, register outlets, record product conversions/sales, capture photo evidence, store GPS location, work offline, and sync data when network is available.

The system also includes an admin dashboard for monitoring agent activity, outlet coverage, sales/conversion performance, sync status, and other operational metrics.

## Product Type

This is not a normal CRUD app.

It is a field operations platform with:

- Mobile-first sales agent experience
- Offline-first data capture
- Image/photo upload handling
- GPS/geolocation capture
- Sync queue and retry logic
- Admin analytics dashboard

## Primary Users

### Sales Agent

Field user who visits outlets and records activity.

Sales agents should be able to:

- Log in securely
- View today’s activity summary
- Register outlets
- Capture GPS location
- Record product sales/conversions
- Capture photo evidence
- Save records offline
- Sync records when online
- View pending, synced, and failed records

### Admin

Back-office user who monitors field activity.

Admins should be able to:

- View total visits
- View conversions/sales
- View sales by product/SKU
- View performance by agent
- View performance by city/territory
- View pending sync records
- View outlet registration activity
- Export or inspect records where required

## Core Workflow

The main field workflow is:

1. Agent logs in
2. Agent lands on mobile dashboard
3. Agent registers or selects an outlet
4. App captures GPS location
5. Agent records product conversion/sale
6. Agent captures photo evidence
7. Record is saved locally if offline
8. Record syncs to the backend when online
9. Admin dashboard updates with synced data

## Tech Stack

Use the following stack unless explicitly changed:

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- UI Library: shadcn/ui
- Icons: lucide-react
- Forms: react-hook-form
- Validation: zod
- Offline local database: IndexedDB using Dexie
- Backend/database: Supabase
- Authentication: Supabase Auth
- File/Image Storage: Cloudflare R2 or Supabase Storage
- Deployment: Vercel
- Charts: Recharts
- Notifications/toasts: Sonner

## Design Direction

The design should feel like a modern enterprise field operations tool.

Use this style:

- Mobile-first
- Clean and minimal
- Professional SaaS dashboard aesthetic
- Large touch-friendly buttons
- Rounded cards
- Clear status indicators
- High contrast for outdoor use
- Light background
- Dark/slate text
- Orange or green accent color
- Bottom navigation for mobile agent screens

Avoid:

- Overly playful UI
- Social media-style layouts
- Ecommerce-style layouts
- Tiny text
- Dense desktop-first screens
- Unnecessary animations

## App Structure

Recommended folder structure:

```txt
  app/
    (auth)/
      login/
        page.tsx

    (agent)/
      layout.tsx
      home/
        page.tsx
      outlets/
        page.tsx
        new/
          page.tsx
      sales/
        page.tsx
        new/
          page.tsx
      sync/
        page.tsx
      profile/
        page.tsx

    (admin)/
      layout.tsx
      dashboard/
        page.tsx
      reps/
        page.tsx
      outlets/
        page.tsx
      sales/
        page.tsx
      reports/
        page.tsx

    api/
      sync/
        route.ts

    layout.tsx
    page.tsx
    globals.css

  components/
    ui/
    agent/
      BottomNav.tsx
      AgentHeader.tsx
      StatCard.tsx
      QuickActionCard.tsx
      OfflineBanner.tsx
      SyncStatusCard.tsx

    forms/
      OutletForm.tsx
      SaleForm.tsx
      PhotoCapture.tsx

    dashboard/
      KpiCard.tsx
      SalesChart.tsx
      RepLeaderboard.tsx

  lib/
    supabase/
      client.ts
      server.ts

    offline/
      db.ts
      sync.ts
      queue.ts

    utils.ts
    constants.ts

  hooks/
    useOnlineStatus.ts
    useGeolocation.ts
    useSyncQueue.ts

  types/
    auth.ts
    outlet.ts
    sale.ts
    sync.ts
    user.ts

  schemas/
    outlet.schema.ts
    sale.schema.ts

  store/
    agent-store.ts




    Agent-Side Screens

Prioritize the agent experience first.

Login Screen

Required:

Logo/brand name
Email or phone field
Password field
Login button
Loading state
Error state
Agent Home Screen

Required:

Greeting with agent name
Online/offline status
Today’s visits
Today’s conversions
Pending sync count
Quick actions:
Register Outlet
Record Sale
Sync Data
Recent activity list
Register Outlet Screen

Required:

Outlet name
Outlet type
Contact person
Phone number
GPS location capture
Location accuracy/status
Save button
Offline save support
Record Sale Screen

Required:

Select outlet
Select product/SKU
Quantity sold
Price/value
Status:
Converted
Pending
Revisit
Notes
Continue button
Photo Verification Screen

Required:

Camera/image capture
Image preview
Retake option
Timestamp
GPS metadata
Submit/save button
Sync Screen

Required:

Pending records
Synced records
Failed records
Retry failed sync
Manual sync button
Clear status messaging
Offline Requirements

Offline functionality is critical.

The app should:

Detect online/offline status
Save new records locally when offline
Queue records for sync
Queue image uploads separately if needed
Retry failed syncs
Show sync status clearly to the agent
Prevent duplicate submissions where possible

Use IndexedDB via Dexie for local persistence.

Avoid using only localStorage for business records.

Sync Rules

Initial sync should be simple and reliable.

For MVP:

Create records locally first
Mark records as pending_sync
When online, send records to backend
On success, mark as synced
On failure, mark as failed
Allow retry
Use client-generated IDs to prevent duplicates

Possible sync statuses:

type SyncStatus = "draft" | "pending_sync" | "syncing" | "synced" | "failed";
Data Models
User
type UserRole = "agent" | "admin" | "supervisor";

interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  territory?: string;
  createdAt: string;
}
Outlet
interface Outlet {
  id: string;
  name: string;
  outletType?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  createdBy: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
Sale / Conversion
type ConversionStatus = "converted" | "pending" | "revisit";

interface Sale {
  id: string;
  outletId: string;
  agentId: string;
  productId: string;
  quantity: number;
  price?: number;
  conversionStatus: ConversionStatus;
  notes?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  photoIds?: string[];
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
Photo Evidence
interface PhotoEvidence {
  id: string;
  localUri?: string;
  remoteUrl?: string;
  saleId?: string;
  outletId?: string;
  agentId: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  syncStatus: SyncStatus;
}
Admin Dashboard

Admin dashboard should be built after the core agent flow.

Required dashboard sections:

KPI cards
Total visits
Total conversions
Conversion rate
Sales by product/SKU
Performance by agent
Performance by territory/city
Recent activity table
Sync status overview

Optional later features:

Map visualization
Leaderboard
CSV/Excel export
Advanced filters
Supervisor access
Targets and achievements
Coding Rules

Follow these rules:

Use TypeScript everywhere
Use server components by default where suitable
Use client components only when browser APIs are required
Browser APIs include:
geolocation
camera/file input
IndexedDB
online/offline detection
Keep components small and focused
Use zod for validation
Use react-hook-form for forms
Use shadcn/ui components where possible
Use readable naming
Avoid overengineering
Prioritize working MVP before advanced abstractions
UI Rules

Use:

shadcn/ui components
Tailwind utility classes
lucide-react icons
card-based layouts
bottom navigation for agent mobile screens
responsive layouts for admin screens

Buttons should be large enough for mobile field use.

Important actions should be obvious.

Status colors:

Green: synced/success/converted
Orange/Yellow: pending/revisit/warning
Red: failed/error
Slate/Neutral: default/inactive
Important Implementation Notes
Geolocation

Geolocation must be captured at the point of outlet registration and sale submission where possible.

Always handle:

permission denied
timeout
poor accuracy
unavailable GPS
Images

Do not store images directly in the database.

Store image metadata in the database and upload actual files to object storage.

For MVP:

allow one or more photo uploads per sale
preview image before submit
compress images if possible
queue image uploads when offline
Authentication

Use Supabase Auth unless otherwise stated.

Protect routes by role:

Agent routes should only be accessible to agents
Admin routes should only be accessible to admins/supervisors
Deployment

Target deployment is Vercel.

Environment variables should be stored in .env.local during development.

Do not hardcode secrets.

MVP Priority

Build in this order:

Project setup
UI foundation and theme
Auth flow
Agent layout and bottom nav
Agent home dashboard
Outlet registration
Geolocation hook
Sale/conversion form
Photo capture/preview
IndexedDB offline storage
Sync queue
Basic admin dashboard
Deployment
Out of Scope for MVP

Do not build these unless explicitly requested:

Complex commission engine
Advanced role hierarchy
Real-time live tracking
Continuous GPS tracking
Push notifications
Complex conflict resolution
AI analytics
Full BI-style dashboard
Multi-tenant billing
Native mobile app
Definition of Done

A feature is done when:

It works on mobile
It handles loading states
It handles error states
It works with poor/no network where relevant
It has clear validation
It stores clean data
It does not break existing flows
It follows the project structure

Follow the instructions in AGENTS.md. Build only the agent mobile MVP first.