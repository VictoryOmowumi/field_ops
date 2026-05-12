import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CAMPAIGN_IDS = [
  "2cacd5d4-f3b0-443a-b222-b22de6430b4a",
  "48c3ff23-79bc-44a9-be78-865f4c65b6cf",
];

const REP_IDS = [
  "1602a347-d58c-45f8-b412-1e5fe4ef4949",
];

const USER_IDS = [
  "b1c2a52d-2994-4e9e-b4b9-25a5e9a16034",
  "3d259c7e-e43c-45e5-8382-f61523839f1e",
];

const CONFIRM = process.argv.includes("--confirm") || process.env.CLEANUP_CONFIRM === "YES";

if (!CONFIRM) {
  console.log("Dry run only. No data deleted.");
  console.log("To execute, run: npm run cleanup:handover -- --confirm");
  process.exit(0);
}

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

async function deleteCampaigns(campaignIds) {
  if (campaignIds.length === 0) return;
  console.log(`Deleting campaigns (${campaignIds.length})...`);

  const { data: shareLinks, error: shareLinksError } = await supabase
    .from("campaign_share_links")
    .select("id")
    .in("campaign_id", campaignIds);
  if (shareLinksError) throw shareLinksError;
  const shareLinkIds = dedupe((shareLinks ?? []).map((row) => row.id));

  if (shareLinkIds.length > 0) {
    const { error } = await supabase
      .from("campaign_share_views")
      .delete()
      .in("share_link_id", shareLinkIds);
    if (error) throw error;
  }

  for (const table of ["campaign_assignments", "campaign_share_links"]) {
    const { error } = await supabase.from(table).delete().in("campaign_id", campaignIds);
    if (error) throw error;
  }

  const { error: deleteCampaignsError } = await supabase.from("campaigns").delete().in("id", campaignIds);
  if (deleteCampaignsError) throw deleteCampaignsError;
}

async function deleteSubmissionsAndOutlets(campaignIds, userIds) {
  console.log("Deleting related submissions and outlets...");

  const { data: campaignOutlets, error: campaignOutletsError } = await supabase
    .from("outlets")
    .select("id")
    .in("campaign_id", campaignIds);
  if (campaignOutletsError) throw campaignOutletsError;

  const { data: userOutlets, error: userOutletsError } = await supabase
    .from("outlets")
    .select("id")
    .in("created_by", userIds);
  if (userOutletsError) throw userOutletsError;

  const outletIds = dedupe([
    ...(campaignOutlets ?? []).map((row) => row.id),
    ...(userOutlets ?? []).map((row) => row.id),
  ]);

  const { data: visitsByCampaign, error: visitsByCampaignError } = await supabase
    .from("visits")
    .select("id, outlet_id")
    .in("campaign_id", campaignIds);
  if (visitsByCampaignError) throw visitsByCampaignError;

  const { data: visitsByUser, error: visitsByUserError } = await supabase
    .from("visits")
    .select("id, outlet_id")
    .in("agent_id", userIds);
  if (visitsByUserError) throw visitsByUserError;

  const visitIds = dedupe([
    ...(visitsByCampaign ?? []).map((row) => row.id),
    ...(visitsByUser ?? []).map((row) => row.id),
  ]);

  const extraOutletIdsFromVisits = dedupe([
    ...(visitsByCampaign ?? []).map((row) => row.outlet_id),
    ...(visitsByUser ?? []).map((row) => row.outlet_id),
  ]);
  const allOutletIds = dedupe([...outletIds, ...extraOutletIdsFromVisits]);

  const { data: evidenceRows, error: evidenceRowsError } = await supabase
    .from("visit_evidence")
    .select("file_url")
    .in("visit_id", visitIds.length > 0 ? visitIds : ["00000000-0000-0000-0000-000000000000"]);
  if (evidenceRowsError) throw evidenceRowsError;
  const evidencePaths = dedupe((evidenceRows ?? []).map((row) => row.file_url));
  if (evidencePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("evidence").remove(evidencePaths);
    if (storageError) {
      console.warn(`Storage cleanup warning: ${storageError.message}`);
    }
  }

  if (visitIds.length > 0) {
    const { error: evidenceDeleteError } = await supabase.from("visit_evidence").delete().in("visit_id", visitIds);
    if (evidenceDeleteError) throw evidenceDeleteError;
  }

  if (campaignIds.length > 0) {
    const { error: campaignSalesDeleteError } = await supabase.from("sales").delete().in("campaign_id", campaignIds);
    if (campaignSalesDeleteError) throw campaignSalesDeleteError;
  }
  if (visitIds.length > 0) {
    const { error: visitSalesDeleteError } = await supabase.from("sales").delete().in("visit_id", visitIds);
    if (visitSalesDeleteError) throw visitSalesDeleteError;
  }
  if (userIds.length > 0) {
    const { error: userSalesDeleteError } = await supabase.from("sales").delete().in("agent_id", userIds);
    if (userSalesDeleteError) throw userSalesDeleteError;
  }

  if (visitIds.length > 0) {
    const { error: visitsDeleteError } = await supabase.from("visits").delete().in("id", visitIds);
    if (visitsDeleteError) throw visitsDeleteError;
  }

  if (allOutletIds.length > 0) {
    const { error: outletsDeleteError } = await supabase.from("outlets").delete().in("id", allOutletIds);
    if (outletsDeleteError) throw outletsDeleteError;
  }
}

async function deleteReps(repIds) {
  if (repIds.length === 0) return;
  console.log(`Deleting rep profiles (${repIds.length})...`);

  const { data: reps, error: repsError } = await supabase
    .from("rep_profiles")
    .select("id, user_id")
    .in("id", repIds);
  if (repsError) throw repsError;

  const repUserIds = dedupe((reps ?? []).map((row) => row.user_id));
  if (repUserIds.length > 0) {
    const { error: assignmentsError } = await supabase
      .from("campaign_assignments")
      .delete()
      .in("user_id", repUserIds)
      .eq("role", "agent");
    if (assignmentsError) throw assignmentsError;
  }

  const { error: deleteRepsError } = await supabase.from("rep_profiles").delete().in("id", repIds);
  if (deleteRepsError) throw deleteRepsError;
}

async function deleteUsers(userIds) {
  if (userIds.length === 0) return;
  console.log(`Deleting users (${userIds.length})...`);

  const { error: repProfileError } = await supabase.from("rep_profiles").delete().in("user_id", userIds);
  if (repProfileError) throw repProfileError;

  const { error: assignmentsError } = await supabase.from("campaign_assignments").delete().in("user_id", userIds);
  if (assignmentsError) throw assignmentsError;

  const { error: membershipsError } = await supabase.from("organization_users").delete().in("user_id", userIds);
  if (membershipsError) throw membershipsError;

  const { error: profilesError } = await supabase.from("profiles").delete().in("user_id", userIds);
  if (profilesError) throw profilesError;

  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`Auth user delete warning (${userId}): ${error.message}`);
    }
  }
}

async function main() {
  console.log("Starting handover cleanup...");
  console.table({ campaignCount: CAMPAIGN_IDS.length, repCount: REP_IDS.length, userCount: USER_IDS.length });

  await deleteSubmissionsAndOutlets(CAMPAIGN_IDS, USER_IDS);
  await deleteCampaigns(CAMPAIGN_IDS);
  await deleteReps(REP_IDS);
  await deleteUsers(USER_IDS);

  console.log("Cleanup completed.");
}

main().catch((error) => {
  console.error("Cleanup failed:", error.message);
  process.exit(1);
});
