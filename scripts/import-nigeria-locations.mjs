import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`[import:nigeria-locations] ${message}`);
  process.exit(1);
}

const inputPathArg = process.argv[2];
if (!inputPathArg) {
  fail("Usage: npm run import:nigeria-locations -- <path-to-json>");
}

const inputPath = path.resolve(process.cwd(), inputPathArg);
if (!fs.existsSync(inputPath)) {
  fail(`Input file not found: ${inputPath}`);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  fail(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const obj = record;

  const state =
    obj.state ??
    obj.State ??
    obj.name ??
    obj.Name ??
    null;

  const lgas =
    obj.lgas ??
    obj.LGAs ??
    obj.local_governments ??
    obj.localGovernmentAreas ??
    obj.local_government_areas ??
    obj.lga ??
    null;

  if (!state || !Array.isArray(lgas)) return null;

  const cleanState = String(state).trim();
  const cleanLgas = [...new Set(lgas.map((x) => String(x).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  if (!cleanState || cleanLgas.length === 0) return null;
  return { state: cleanState, lgas: cleanLgas };
}

let sourceArray = [];
if (Array.isArray(raw)) {
  sourceArray = raw;
} else if (raw && typeof raw === "object") {
  const candidateKeys = ["data", "states", "records", "items"];
  const key = candidateKeys.find((k) => Array.isArray(raw[k]));
  if (key) sourceArray = raw[key];
}

if (!Array.isArray(sourceArray) || sourceArray.length === 0) {
  fail("No array records found. Expected an array or object with data/states/records/items array.");
}

const normalized = sourceArray
  .map(normalizeRecord)
  .filter(Boolean)
  .sort((a, b) => a.state.localeCompare(b.state));

if (normalized.length === 0) {
  fail("No valid state/LGA records found after normalization.");
}

const outputPath = path.resolve(process.cwd(), "data/nigeria-locations.ts");
const fileContent = `export type NigeriaLocation = {
  state: string;
  lgas: string[];
};

// Generated/imported state + LGA source for forms.
// Run \`npm run import:nigeria-locations -- <path-to-json>\` to rebuild.
export const nigeriaLocations: NigeriaLocation[] = ${JSON.stringify(normalized, null, 2)};
`;

fs.writeFileSync(outputPath, fileContent, "utf8");
console.log(`[import:nigeria-locations] Wrote ${normalized.length} states to ${outputPath}`);

