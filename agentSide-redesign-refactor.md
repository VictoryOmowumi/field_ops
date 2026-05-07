We need to redesign and refactor the agent-side execution flow as well as the flow for the campaign setup for ActivationIQ.

IMPORTANT:
Do NOT think of this product as “a sales form app”.
This is a FIELD EXECUTION PLATFORM for FMCG/trade marketing operations.

The goal is to create a SIMPLE, GUIDED, MOBILE-FIRST field execution experience for low-technical field agents.

The current implementation feels too technical and exposes backend architecture concepts directly in the UI.

We need to redesign the experience around:
- workflows
- visit execution
- guided task completion
- operational simplicity
- progressive disclosure
- human-readable field actions

The UI should feel:
- simple
- guided
- operational
- WhatsApp/POS-like
- stress-free
- optimized for field agents under movement/noise/network pressure

NOT:
- enterprise workflow builder
- technical admin system
- dynamic schema engine

====================================================================
CORE PRODUCT UNDERSTANDING
====================================================================

This product supports FMCG field campaigns.

Examples:
- sales activation
- retail audit
- product availability survey
- merchandising audit
- price intelligence
- outlet registration
- product sampling
- competitor tracking

Agents go into the field and perform VISITS.

A VISIT may include:
- outlet registration
- outlet revisit
- sales conversion
- product availability checks
- pricing audit
- product/shelf survey
- photo evidence
- GPS verification
- notes

VERY IMPORTANT:
A visit is the core activity.

Sales are OPTIONAL.

Outlet registration does NOT automatically mean conversion.

====================================================================
IMPORTANT DOMAIN RULES
====================================================================

A VISIT always exists.

A SALE is optional.

Examples:

1.
Outlet registered + products sold
→ Visit created
→ Outlet created/found
→ Sale created
→ Conversion = yes

2.
Outlet registered but customer refused to buy
→ Visit created
→ Outlet created/found
→ No sale
→ Conversion = no

3.
Existing outlet revisited + products sold
→ Existing outlet found
→ Visit created
→ Sale created

4.
Existing outlet revisited + no sale
→ Visit created
→ No sale

The backend should handle duplicate outlet matching silently.

DO NOT disturb the agent with:
“This outlet already exists.”

Instead:
- backend matches existing outlets using:
  - normalized outlet name
  - phone
  - address similarity
  - GPS proximity

If match found:
→ reuse outlet

If no match:
→ create outlet

Agent should continue naturally without interruption.

====================================================================
PRIMARY CAMPAIGN TASK TYPES
====================================================================

The platform currently supports these activities/tasks:

- register_outlet
- revisit_outlet
- sell_to_outlet
- product_survey
- availability_survey
- price_survey

IMPORTANT:
A campaign is NOT one task.

A campaign is a WORKFLOW made up of one or more activities.

====================================================================
REAL-WORLD CAMPAIGN SCENARIOS
====================================================================

SCENARIO 1 — Outlet Registration Drive

Goal:
Build outlet/customer database.

Activities:
- register_outlet

Flow:
Start Visit
→ Register outlet
→ GPS
→ Photo
→ Submit

No sales.

====================================================================

SCENARIO 2 — Retail Sales Activation

MOST COMMON FMCG FLOW.

Goal:
Visit outlet and push product sales.

Activities:
- register_outlet
- sell_to_outlet

Flow:
Start Visit
→ Outlet Info
→ Product Sale
→ Quantity
→ Selling Price
→ Photo Evidence
→ Submit

Possible outcomes:
- sold
- refused_to_buy
- pending
- revisit_later

This is the Mirinda Berry Blast example.

====================================================================

SCENARIO 3 — Existing Outlet Sales Push

Goal:
Push products to already-known outlets.

Activities:
- revisit_outlet
- sell_to_outlet

Flow:
Find nearby outlet
→ Select existing outlet
→ Record sale
→ Photo
→ Submit

No outlet registration required.

====================================================================

SCENARIO 4 — Product Availability Survey

Goal:
Check which outlets stock products.

Activities:
- availability_survey

Flow:
Select/Register outlet
→ Availability questions
→ Optional photo
→ Submit

No sales.

====================================================================

SCENARIO 5 — Market Price Intelligence

Goal:
Capture market pricing.

Activities:
- price_survey
- product_survey

Flow:
Outlet
→ Product pricing
→ Competitor pricing
→ Photos
→ Submit

====================================================================

SCENARIO 6 — Merchandising/Product Audit

Goal:
Check shelf/product visibility.

Activities:
- product_survey

Flow:
Outlet
→ Shelf visibility questions
→ Product display questions
→ Photos
→ Submit

====================================================================

SCENARIO 7 — Full Trade Audit

MOST ADVANCED FLOW.

Activities:
- register_outlet
- availability_survey
- price_survey
- product_survey
- sell_to_outlet

Flow:
Outlet Info
→ Availability
→ Pricing
→ Product Audit
→ Sales
→ Photos
→ Submit

====================================================================
VERY IMPORTANT UX RULES
====================================================================

DO NOT expose backend/system terminology to agents.

Agents should NEVER see:
- register_outlet
- sell_to_outlet
- revisit_outlet
- registered_only
- converted
- pending_sync
- workflow engine concepts

Instead show HUMAN language.

BAD:
“Visit Outcome”
“registered_only”

GOOD:
“What happened at this outlet?”
- Products sold
- Customer refused to buy
- Follow-up needed
- Outlet closed
- Not interested

====================================================================
IMPORTANT UX FIXES
====================================================================

1. DO NOT ask:
“Use Existing Outlet” vs “Register New Outlet” immediately.

Instead:
- auto-load nearby outlets using GPS
- show nearby suggestions first

Example:

Nearby Outlets

Jolly Mart • 120m
Prime Stores • 180m

[ Select ]

Can't find outlet?
[ Register New Outlet ]

This reduces duplicate outlets and cognitive load.

====================================================================

2. Use PROGRESSIVE DISCLOSURE.

DO NOT dump all sections at once.

Wrong:
Showing products, outcomes, surveys, sales all immediately.

Correct:
1. Select/Register outlet
2. Choose visit activity/outcome
3. THEN show relevant sections dynamically

Example:
If outcome = “Products sold”
→ show sales section

Otherwise:
→ hide sales section entirely

====================================================================

3. Agent flow should feel guided.

Use:
- steps
- progress indicators
- clear next actions
- large touch targets
- mobile-first spacing

NOT:
- giant configuration forms
- dense enterprise dashboards

====================================================================

4. Primary action should always be obvious.

The app should strongly guide:
START VISIT
CONTINUE
SUBMIT

====================================================================
IMPORTANT ARCHITECTURE DECISION
====================================================================

DO NOT build:
Campaign → giant dynamic form

Instead build:
Campaign
→ Workflow
→ Activities
→ Sections
→ Fields

The workflow should determine:
- sequence
- sections
- conditional rendering
- required fields

====================================================================
RECOMMENDED CAMPAIGN WORKFLOW TEMPLATES
====================================================================

Template 1:
Outlet Registration
Activities:
- register_outlet

Template 2:
Sales Activation
Activities:
- register_outlet
- sell_to_outlet

Template 3:
Product Audit
Activities:
- availability_survey
- product_survey
- price_survey

Template 4:
Existing Outlet Sales
Activities:
- revisit_outlet
- sell_to_outlet

Template 5:
Full Trade Audit
Activities:
- register_outlet
- availability_survey
- price_survey
- product_survey
- sell_to_outlet

These templates should cover 90–95% of FMCG activation use cases.

====================================================================
IMPORTANT EDGE CASES TO HANDLE
====================================================================

1.
Outlet already exists silently
→ backend matches automatically

2.
Outlet spelling variations
→ fuzzy matching

3.
No sale
→ still valid visit

4.
Partial sale
→ partial conversion

5.
Outlet closed
→ still valid visit

6.
GPS unavailable
→ retry or override flow

7.
Offline submission
→ save locally as pending_sync

8.
Multiple visits to same outlet same day
→ allowed

9.
Multiple products sold
→ supported

====================================================================
WHAT NEEDS TO BE IMPLEMENTED NOW
====================================================================

We need to redesign:
- campaign workflow architecture
- campaign activity configuration
- agent visit flow
- dynamic section rendering
- mobile-first UX
- human-readable operational language
- progressive step-based execution

The focus should be:
- operational simplicity
- clarity
- guided field execution
- realistic FMCG workflows
- low cognitive load
- scalable architecture

IMPORTANT:
Do NOT overengineer.
Do NOT build a drag-and-drop workflow builder.
Do NOT expose raw system concepts in UI.

We need:
- reusable workflow templates
- configurable activities
- guided mobile visit flows
- clean architecture
- simple operational UX