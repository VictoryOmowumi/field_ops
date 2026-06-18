// Proves lib/workflow.ts's deriveVisitTaskType() against the agreed test
// matrix without needing a test runner (none is configured in this repo).
// It transpiles the real source file (stripping its type-only import, so no
// module resolution/path-alias handling is needed) and runs it directly,
// so this is exercising the actual shipped logic, not a reimplementation.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, "..", "lib", "workflow.ts");
const source = readFileSync(sourcePath, "utf8");

const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

const moduleObj = { exports: {} };
new Function("exports", "module", outputText)(moduleObj.exports, moduleObj);
const { deriveVisitTaskType } = moduleObj.exports;

if (typeof deriveVisitTaskType !== "function") {
  console.error("FAIL: deriveVisitTaskType was not exported from lib/workflow.ts");
  process.exit(1);
}

const cases = [
  {
    label: "register outlet + notes",
    activityIds: ["notes"],
    outletMode: "new",
    expected: "register_outlet",
  },
  {
    label: "register outlet + POSM",
    activityIds: ["posm_deployment"],
    outletMode: "new",
    expected: "register_outlet",
  },
  {
    label: "register outlet + free samples",
    activityIds: ["free_sample_distribution"],
    outletMode: "new",
    expected: "register_outlet",
  },
  {
    label: "sales visit + POSM",
    activityIds: ["sell_to_outlet", "posm_deployment"],
    outletMode: "new",
    expected: "sell_to_outlet",
  },
  {
    label: "existing outlet revisit + notes",
    activityIds: ["notes"],
    outletMode: "existing",
    expected: "revisit_outlet",
  },
  {
    label: "availability survey only",
    activityIds: ["availability_survey"],
    outletMode: "new",
    expected: "availability_survey",
  },
  // Extra coverage beyond the required matrix:
  {
    label: "no activities at all, new outlet (e.g. registration with nothing else configured)",
    activityIds: [],
    outletMode: "new",
    expected: "register_outlet",
  },
  {
    label: "no activities at all, existing outlet",
    activityIds: [],
    outletMode: "existing",
    expected: "revisit_outlet",
  },
  {
    label: "multiple auxiliary activities, none primary",
    activityIds: ["notes", "photo_evidence", "posm_deployment", "free_sample_distribution"],
    outletMode: "new",
    expected: "register_outlet",
  },
  {
    label: "product audit campaign: all three survey types present",
    activityIds: ["product_survey", "price_survey", "availability_survey"],
    outletMode: "new",
    expected: "availability_survey",
  },
  {
    label: "sale recorded alongside a survey — sale takes priority",
    activityIds: ["price_survey", "sell_to_outlet"],
    outletMode: "new",
    expected: "sell_to_outlet",
  },
];

let failures = 0;
for (const testCase of cases) {
  const result = deriveVisitTaskType(testCase.activityIds, testCase.outletMode);
  const pass = result === testCase.expected;
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${testCase.label}  ->  expected ${testCase.expected}, got ${result}`
  );
}

console.log(`\n${cases.length - failures}/${cases.length} passed.`);
process.exit(failures > 0 ? 1 : 0);
