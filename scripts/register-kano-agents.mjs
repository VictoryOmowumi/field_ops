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

const ORGANIZATION_ID = "6cd33ac8-faf3-4665-95d6-579f417f1fcd";
const STATE = "Kano";
const KANO_LGAS = [
  "Kano Municipal",
  "Fagge",
  "Dala",
  "Gwale",
  "Tarauni",
  "Nassarawa",
  "Ungogo",
  "Kumbotso",
  "Dawakin Tofa",
  "Gezawa",
  "Kura",
  "Madobi",
  "Rano",
  "Bichi",
];

const DEFAULT_COUNTRY_CODE = "234";

function normalizePhoneToE164(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null;
  }

  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : null;
  }

  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    return /^\d{7,14}$/.test(rest) ? `+${DEFAULT_COUNTRY_CODE}${rest}` : null;
  }

  if (/^\d{7,15}$/.test(digits)) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return null;
}

function titleCase(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function pickRandomLga() {
  return KANO_LGAS[Math.floor(Math.random() * KANO_LGAS.length)];
}

const agents = [
  // TEAM 1
  ["RAHIM LADAN", "08091363825"],
  ["BLESSING MARKUS", "08064704701"],
  ["SARAH ADIKANU", "07037745200"],
  ["PEACE YUHANNA", "09064370579"],
  ["JOY ALPHA", "08032158241"],
  ["HELEN AGI", "08099847838"],
  ["ATIENCE LIVINUS", "08144137796"],
  ["PEACE JOSEPH", "07061714017"],
  ["MUHAMMAD FATIMA", "09138086789"],
  ["BABANGIDA YAKUBU", "07012177777"],
  // TEAM 2
  ["Blessing Agu", "07037523887"],
  ["Blessing Zion Massodi", "8160782912"],
  ["Maureen Moses", "09164742939"],
  ["Godwin Agu", "07077434737"],
  ["Margaret Zakariah", "09039593680"],
  ["Ochiagha Adaobi Christiana", "07032666245"],
  ["Paulne Omiliyi", "09125595844"],
  ["Shirya Markus", "08086719129"],
  ["Udoka Peace", "8148499497"],
  ["Onongwu Victor", "09127903217"],
  // TEAM 3
  ["Mary David", "09069707156"],
  ["Promise David", "08167178833"],
  ["Moses Anthony", "07011898904"],
  ["Serah David", "08080879012"],
  ["Mary Kwagha", "08164976758"],
  ["Joy Enwelozor", "07080775373"],
  ["Esther Agodi", "09039988298"],
  ["Job Michael", "07049026040"],
  ["Happiness Michael", "09115304367"],
  ["Esther Elechukwu", "07042689035"],
  // TEAM 4
  ["Joseph Daniel", "09032325937"],
  ["Queen Sussce Vincent", "09157520697"],
  ["Elizabeth", "08140018897"],
  ["Aisha Salma", "09018243209"],
  ["Helen Kelvin", "08148383439"],
  ["Farida Suleman", "07038395310"],
  ["Israel David", "07015151683"],
  ["Emmanuella Matthew", "07079446485"],
  ["Sekina Rafiu", "07011264832"],
  ["Musa Isah", "08177335335"],
  // TEAM 5
  ["Cicilia Odeh", "07031098858"],
  ["Peace Bernard", "07068637879"],
  ["Nita Idenyi", "07067361358"],
  ["Esther Danlami", "09132323139"],
  ["Elizabeth Joshua", "08122303043"],
  ["Abraham Joseph", "08039321933"],
  ["Grace Sani", "08032822747"],
  ["Hope Langkat Bernard", "07037449004"],
  ["Happiness Alexander", "09028098545"],
  ["Michael Amechi", "09029773755"],
  // TEAM 6
  ["Kabiru Muhammed", "07045941020"],
  ["Patrick Eziuche", "08137180745"],
  ["Monday Paul", "08101211406"],
  ["Francis Daniel", "09160192019"],
  ["Favour Oluma", "09135439323"],
  ["Abdulrashid Muhammed", "08139724400"],
  ["Sophie Moses Daniel", "08101142655"],
  ["Basira Muhammed", "09128030298"],
  ["Maryam Abdulkareem", "08037287436"],
  ["Gift Duniya", "09030058629"],
  // TEAM 7
  ["Maryam Zubairu", "09165150228"],
  ["Faiza Buba", "08165614819"],
  ["Derek Nwobi", "09131432135"],
  ["Starley Yahaya", "09067177082"],
  ["Elijah Samson", "08087665463"],
  ["Adeyeye Richard", "09165410209"],
  // skipped: Cynthia Sheplong (08101142655) — duplicate of Sophie Moses Daniel (Team 6)
  ["Blessing Ake", "07065541737"],
  // skipped: John Christabel (08037287436) — duplicate of Maryam Abdulkareem (Team 6)
  ["Suleiman Yahaya", "0813 829 5692"],
  // TEAM 8
  ["Gideon Ibrahim", "09077196464"],
  ["David", "08035163114"],
  ["Rachel", "09035326452"],
  ["Lydia Okwor", "07038281221"],
  ["Blessing", "08035045031"],
  ["Deborah Gabriel", "08167723919"],
  ["Margret", "08161889590"],
  ["Eunice", "09124809260"],
  ["Kelvin", "07026497252"],
  ["Grace", "08165471361"],
  // TEAM 9
  ["Chindo Yakubu", "08149042807"],
  ["Mathew Anthony", "08135342582"],
  ["Precious Orise", "08162212181"],
  ["Josephine Igwe", "08122005292"],
  ["Rejoice John", "08126525035"],
  ["Nuradeen Adam", "08167648108"],
  ["Chioma Jecinta Obasi", "07038297547"],
  ["Helen Chigbu", "08039269384"],
  ["Fatima Said Yusuf", "09072211989"],
  ["Odobi Patience", "09070849070"],
  // TEAM 10
  ["Jerimiar Iliyas", "08100557672"],
  ["Obiefule Scholastica", "07061446915"],
  ["Elizabeth Johnson", "08163031468"],
  ["Sunday Deborah", "09033909781"],
  ["Peace Asabar Nantok", "09113563436"],
  ["Alu Linda", "09063281987"],
  ["Patience Etim", "08066287348"],
  ["Amarachi Precious", "07032975755"],
  ["Precious", "09138389837"],
];

async function getUserByPhone(phone) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user) => user.phone === phone.replace("+", ""));
    if (match) return match;

    if (users.length < perPage) return null;
    page += 1;
  }
}

async function registerAgent(name, rawPhone, index) {
  const fullName = titleCase(name);
  const phone = normalizePhoneToE164(rawPhone);
  if (!phone) {
    console.error(`skip: ${fullName} — invalid phone "${rawPhone}"`);
    return;
  }

  const nowIso = new Date().toISOString();
  const lga = pickRandomLga();
  const repCode = `KN-${String(index + 1).padStart(3, "0")}`;

  let userId;
  const existing = await getUserByPhone(phone);
  if (existing) {
    userId = existing.id;
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      phone_confirm: true,
      app_metadata: { role: "agent" },
      user_metadata: { full_name: fullName, role: "agent" },
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      phone,
      phone_confirm: true,
      app_metadata: { role: "agent" },
      user_metadata: { full_name: fullName, role: "agent" },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      full_name: fullName,
      phone,
      auth_method: "phone",
      phone_verified_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;

  const { error: memberError } = await supabase.from("organization_users").upsert(
    {
      organization_id: ORGANIZATION_ID,
      user_id: userId,
      role: "agent",
      status: "active",
      accepted_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "organization_id,user_id" }
  );
  if (memberError) throw memberError;

  const { error: repError } = await supabase.from("rep_profiles").upsert(
    {
      organization_id: ORGANIZATION_ID,
      user_id: userId,
      rep_code: repCode,
      state: STATE,
      lga,
      status: "active",
      updated_at: nowIso,
    },
    { onConflict: "organization_id,user_id" }
  );
  if (repError) throw repError;

  console.log(`done: ${fullName} (${phone}) -> ${repCode}, ${lga}, ${STATE}`);
}

async function main() {
  for (let i = 0; i < agents.length; i += 1) {
    const [name, phone] = agents[i];
    await registerAgent(name, phone, i);
  }
  console.log(`done: ${agents.length} agents registered to org ${ORGANIZATION_ID}.`);
}

main().catch((error) => {
  console.error("registration failed:", error.message);
  process.exit(1);
});
