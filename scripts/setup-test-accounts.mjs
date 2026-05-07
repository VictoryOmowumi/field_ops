import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testAccounts = [
  {
    email: "agent.test@ActivationIQ.local",
    password: "ActivationIQ123!",
    role: "agent",
    fullName: "Test Agent",
  },
  {
    email: "admin.test@ActivationIQ.local",
    password: "ActivationIQ123!",
    role: "admin",
    fullName: "Test Admin",
  },
  {
    email: "superadmin.test@ActivationIQ.local",
    password: "ActivationIQ123!",
    role: "super_admin",
    fullName: "Test Super Admin",
  },
];

async function getUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;

    if (users.length < perPage) return null;
    page += 1;
  }
}

async function createOrUpdateAccount(account) {
  const existing = await getUserByEmail(account.email);

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: account.password,
      app_metadata: { role: account.role },
      user_metadata: { full_name: account.fullName, role: account.role },
      email_confirm: true,
    });

    if (error) throw error;
    console.log(`updated: ${account.email} (${account.role})`);
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    app_metadata: { role: account.role },
    user_metadata: { full_name: account.fullName, role: account.role },
  });

  if (error) throw error;
  console.log(`created: ${account.email} (${account.role})`);
}

async function main() {
  for (const account of testAccounts) {
    await createOrUpdateAccount(account);
  }
  console.log("done: test accounts are ready.");
}

main().catch((error) => {
  console.error("setup failed:", error.message);
  process.exit(1);
});

