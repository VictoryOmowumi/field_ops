import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const envPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envRaw = readFileSync(envPath, "utf8");
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

function mapTemplate(tasks) {
  const key = [...tasks].sort().join("|");
  if (key === "") return "sales_activation";
  if (key === "register_outlet") return "outlet_registration";
  if (key === "revisit_outlet") return "existing_outlet_sales";
  if (key === "sell_to_outlet") return "sales_activation";
  if (key === "product_survey") return "product_audit";
  if (key === "availability_survey") return "product_audit";
  if (key === "price_survey") return "product_audit";
  if (key === "availability_survey|product_survey") return "product_audit";
  if (key === "price_survey|product_survey") return "product_audit";
  if (key === "availability_survey|price_survey") return "product_audit";
  if (key === "register_outlet|sell_to_outlet") return "sales_activation";
  if (key === "availability_survey|price_survey|product_survey") return "product_audit";
  if (key === "revisit_outlet|sell_to_outlet") return "existing_outlet_sales";
  if (key === "availability_survey|price_survey|product_survey|register_outlet|sell_to_outlet") return "full_trade_audit";
  return null;
}

function buildWorkflow(template) {
  const activityMap = {
    outlet_registration: ["register_outlet", "photo_evidence", "notes"],
    sales_activation: ["register_outlet", "sell_to_outlet", "photo_evidence", "notes"],
    product_audit: ["availability_survey", "price_survey", "product_survey", "photo_evidence", "notes"],
    existing_outlet_sales: ["revisit_outlet", "sell_to_outlet", "photo_evidence", "notes"],
    full_trade_audit: ["register_outlet", "availability_survey", "price_survey", "product_survey", "sell_to_outlet", "photo_evidence", "notes"],
  };

  return {
    workflowVersion: 1,
    template,
    activities: (activityMap[template] ?? ["register_outlet", "sell_to_outlet", "photo_evidence", "notes"]).map((id) => ({ id, required: true })),
    validationRules: { requireGpsBeforeSubmit: true, requirePhotoEvidence: true, minimumPhotos: 1, maximumPhotos: 4 },
    agentCopy: {
      startVisitLabel: "Start Visit",
      continueLabel: "Continue",
      submitVisitLabel: "Submit Visit",
      outcomeQuestion: "What happened at this outlet?",
      outcomes: [
        { code: "products_sold", label: "Products sold" },
        { code: "customer_refused", label: "Customer refused to buy" },
        { code: "follow_up_needed", label: "Follow-up needed" },
        { code: "outlet_closed", label: "Outlet closed" },
        { code: "not_interested", label: "Not interested" },
      ],
    },
  };
}

const { data: campaigns, error } = await supabase
  .from("campaigns")
  .select("id, campaign_tasks, campaign_workflow_template, campaign_workflow");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const unresolved = [];
let updated = 0;

for (const campaign of campaigns ?? []) {
  if (campaign.campaign_workflow_template && campaign.campaign_workflow && Object.keys(campaign.campaign_workflow).length > 0) {
    continue;
  }
  const tasks = Array.isArray(campaign.campaign_tasks) ? campaign.campaign_tasks : [];
  const template = mapTemplate(tasks);
  if (!template) {
    unresolved.push({ campaignId: campaign.id, tasks });
    continue;
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      campaign_workflow_template: template,
      campaign_workflow: buildWorkflow(template),
    })
    .eq("id", campaign.id);

  if (updateError) {
    unresolved.push({ campaignId: campaign.id, tasks, error: updateError.message });
  } else {
    updated += 1;
  }
}

console.log(`Backfill complete. Updated campaigns: ${updated}`);
if (unresolved.length > 0) {
  console.log("Unresolved campaigns:");
  console.table(unresolved);
}
