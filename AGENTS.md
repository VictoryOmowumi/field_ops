# AGENTS.md — Multi-Tenant SaaS Version Updates

## Updated Product Overview

This project is a multi-tenant field sales activation SaaS platform.

The platform allows multiple organizations (clients/agencies) to run field activations and sales campaigns independently within their own isolated workspace.

Each organization can:

* Manage campaigns
* Register sales agents
* Configure products/SKUs
* Capture field activity
* View dashboards and analytics
* Monitor campaign execution in near real-time

The platform supports:

* Mobile-first field data capture
* Offline-first workflows
* GPS/geolocation capture
* Photo evidence uploads
* Sync queues and retry handling
* Multi-organization data isolation
* Campaign-based operational reporting

---

# Updated Product Type

This is not a normal CRUD app.

This is a multi-tenant field activation management platform.

The platform combines:

* Mobile field operations
* Offline-first data collection
* Campaign management
* Organization management
* Reporting and analytics
* Proof-of-execution workflows
* SaaS-style tenant isolation

The system should be architected as a reusable platform that can onboard multiple organizations over time.

---

# Platform Architecture

The platform has 3 major layers.

## Layer 1 — Super Admin Platform

This is the platform owner layer.

This layer is managed internally by the platform owner.

Super Admin responsibilities:

* Create organizations
* Manage organizations
* Activate/deactivate organizations
* Create organization admins
* Configure organization access
* Monitor campaigns globally
* Monitor sync and platform health
* Support organizations
* Manage platform-wide settings

The super admin can view data across all organizations.

---

## Layer 2 — Organization Dashboard

Each organization represents a client or agency.

Organizations operate independently and cannot access another organization’s data.

Organization Admin responsibilities:

* Manage campaigns
* Register sales reps/agents
* Configure products/SKUs
* View campaign analytics
* Monitor field activity
* View outlet registrations
* View sales/conversions
* Export reports where required

All organization data must be isolated using organizationId.

---

## Layer 3 — Sales Agent Mobile App

Sales agents are field users.

Agents should be able to:

* Log in securely
* View assigned campaigns
* Register outlets
* Capture GPS location
* Record sales/conversions
* Capture photo evidence
* Save records offline
* Sync records when online
* View pending and synced records

The mobile app should prioritize:

* Simplicity
* Reliability
* Outdoor usability
* Fast interactions
* Offline resilience

---

# Multi-Tenant Rules

Tenant isolation is critical.

Every major business entity must belong to an organization.

All queries and backend operations must respect organization boundaries.

Organization data must never leak across tenants.

The following entities must include organizationId:

* users
* campaigns
* outlets
* products
* sales
* photos
* reports
* dashboards

---

# Updated Core Business Entities

## Organization

```ts
interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  status: "active" | "inactive";
  createdAt: string;
}
```

---

## Campaign

```ts
interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
}
```

---

## User

```ts
export type UserRole =
  | "super_admin"
  | "org_admin"
  | "supervisor"
  | "agent";

interface User {
  id: string;
  organizationId: string;
  campaignIds?: string[];
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  territory?: string;
  createdAt: string;
}
```

---

## Outlet

```ts
interface Outlet {
  id: string;
  organizationId: string;
  campaignId?: string;
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
```

---

## Sale / Conversion

```ts
interface Sale {
  id: string;
  organizationId: string;
  campaignId?: string;
  outletId: string;
  agentId: string;
  productId: string;
  quantity: number;
  price?: number;
  conversionStatus: "converted" | "pending" | "revisit";
  notes?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number;
  photoIds?: string[];
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
```

---

# Updated Admin Layers

## Super Admin Dashboard

Required MVP features:

* Create organizations
* View organizations
* Create organization admins
* View campaign activity across organizations
* Monitor sync issues
* Monitor active/inactive organizations

Do NOT build billing systems yet.

Keep the super admin lightweight in MVP.

---

## Organization Dashboard

Required MVP features:

* KPI cards
* Total visits
* Total conversions
* Conversion rate
* Sales by product/SKU
* Performance by agent
* Performance by territory/city
* Recent activity table
* Sync status overview
* Campaign selection/filtering

---

# Updated Routing Structure

```txt
src/app/
  (super-admin)/
    organizations/
    campaigns/
    dashboard/

  (org-admin)/
    dashboard/
    campaigns/
    reps/
    outlets/
    sales/
    reports/

  (agent)/
    home/
    outlets/
    sales/
    sync/
    profile/
```

---

# Updated Platform Positioning

This platform should NOT be positioned internally as a surveillance or anti-fraud tool.

Primary positioning:

* Campaign visibility
* Faster reporting
* Centralized field operations
* Easier activation management
* Better operational coordination
* Structured field data capture
* Simplified reporting workflows

Transparency and accountability are secondary outcomes.

The product should feel operationally helpful, not punitive.

---

# Important Product Strategy

The platform is intended to evolve into a reusable activation infrastructure platform.

Future organizations should be onboarded without needing a completely new application deployment.

However, MVP should prioritize:

* One strong organization experience
* Reliable field workflows
* Reliable sync
* Simple dashboards
* Clean architecture

Avoid overengineering platform complexity in v1.

---

# Updated MVP Priorities

Build in this order:

1. Project setup
2. UI foundation
3. Authentication
4. Organization-aware auth/session handling
5. Agent mobile experience
6. Outlet registration
7. Sale capture
8. Photo capture
9. Offline local persistence
10. Sync queue
11. Organization dashboard
12. Super admin organization management
13. Deployment

---

# Out of Scope for MVP

Do NOT build yet:

* Subscription billing engine
* Automated payments
* Multi-region deployment
* Dynamic form builder
* Full no-code workflow engine
* AI insights
* Advanced permissions matrix
* Real-time live location tracking
* Continuous background GPS tracking
* Native mobile apps
* Advanced analytics warehouse
* White-label domain management

---

# Important Architectural Notes

## Organization Context

Authenticated sessions should always resolve:

* current organization
* current role
* assigned campaigns

The frontend should always operate within organization context.

---

## Data Access

All backend queries must be scoped by organizationId.

Never fetch globally unless user role is super_admin.

---

## Deployment Strategy

MVP should use a single deployment.

Do NOT implement subdomain tenancy initially.

Use route-based tenancy:

```txt
/platform/org/[organizationSlug]
```

Subdomains can be introduced later.

---

# Definition of Success

The MVP is successful when:

* Organizations can be onboarded quickly
* Campaigns can be configured easily
* Agents can reliably capture field data
* Data syncs reliably
* Dashboards provide operational visibility
* Multiple organizations can coexist safely
* The platform is reusable for future activations



## The Story Behind the Platform

Most field activations and sales campaigns in the FMCG space still run on fragmented processes.

Agencies hire temporary field reps, send them into markets, shops, and activation locations, and then rely heavily on manual reporting afterward — spreadsheets, WhatsApp pictures, delayed summaries, and slide decks created days after the campaign has already happened.

The problem is that field activity is difficult to verify in real time.

Brands and agencies often struggle with questions like:

* Which outlets were actually visited?
* Which sales reps were active?
* Where was activity happening?
* What products were sold or promoted?
* Was campaign data captured accurately?
* How quickly can campaign performance be reviewed?

Most existing workflows focus more on compiling reports after the fact than creating structured operational visibility during the activation itself.

---

## The Opportunity

This platform is being built to modernize field activation operations through a mobile-first, real-time operational system.

Instead of relying on disconnected reporting processes, the platform creates a centralized environment where organizations can manage campaigns, field reps, outlet activities, and campaign performance from a single system.

The goal is not just “data collection.”

The goal is to create:

* structured field execution
* faster reporting
* operational visibility
* reusable activation infrastructure
* simpler campaign management

---

# What the Platform Does

The platform allows organizations to run field activations digitally.

Each organization can:

* onboard sales reps/agents
* create campaigns
* configure products/SKUs
* manage outlet visits
* capture field sales/conversions
* collect geo-tagged photo evidence
* monitor activity through dashboards

Field agents use a mobile-first application designed specifically for real-world operational conditions, including poor connectivity and outdoor usage.

The app supports:

* offline-first workflows
* GPS location capture
* image/photo uploads
* sync queues and retry handling
* simple mobile interactions optimized for field use

When internet connectivity becomes available, captured records automatically sync back to the platform.

---

# Platform Architecture

The system is designed as a multi-tenant SaaS platform.

This means multiple organizations can operate independently within the same infrastructure while keeping their data isolated and secure.

The platform contains three major layers:

## 1. Super Admin Platform Layer

This is the platform management layer.

It is used to:

* onboard organizations
* manage organization access
* monitor platform activity
* provision campaigns
* manage operational support

---

## 2. Organization Dashboard Layer

Each organization gets its own workspace.

Organizations can:

* manage campaigns
* onboard reps
* configure products
* view dashboards
* monitor field execution
* review campaign performance

---

## 3. Sales Agent Mobile Layer

This is the field execution layer.

Sales agents use a mobile-first application to:

* register outlets
* capture visits
* record conversions/sales
* upload photo evidence
* sync field activity

The experience is intentionally optimized for:

* speed
* simplicity
* reliability
* low-connectivity environments

---

# Product Philosophy

The platform is not being positioned as a surveillance or anti-fraud tool.

Instead, it is designed around:

* operational efficiency
* centralized campaign coordination
* faster reporting
* improved field visibility
* structured execution workflows

Transparency and accountability become natural outcomes of better operational tooling.

---

# Why This Matters

Field activations, merchandising campaigns, and trade marketing operations are recurring activities across FMCG and distribution ecosystems.

Yet many teams still rely on manual reporting structures that make it difficult to:

* measure performance quickly
* coordinate field activity efficiently
* maintain consistent operational records

This platform introduces a reusable operational layer for running field campaigns at scale.

Over time, the platform can evolve into infrastructure for:

* sales activations
* merchandising audits
* retail compliance
* trade marketing execution
* sampling campaigns
* market surveys
* territory performance tracking

---

# Vision

The long-term vision is to create a reusable field operations platform that organizations can repeatedly use to launch, manage, monitor, and report on field campaigns without rebuilding operational processes from scratch each time.

The immediate MVP focuses on:

* reliable field capture
* offline-first workflows
* organization management
* campaign visibility
* simple operational dashboards

while establishing the foundation for a scalable multi-organization platform in the future.
