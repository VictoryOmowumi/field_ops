import fs from "node:fs";
import path from "node:path";

const targetPath = path.resolve(process.cwd(), "data/nigeria-locations.ts");
const source = fs.readFileSync(targetPath, "utf8");

const exportMarker = "export const nigeriaLocations";
const markerIndex = source.indexOf(exportMarker);
if (markerIndex === -1) {
  throw new Error("Could not find export const nigeriaLocations in data/nigeria-locations.ts");
}

const start = source.indexOf("[", markerIndex);
const end = source.lastIndexOf("]");

if (start === -1 || end === -1 || end <= start) {
  throw new Error("Could not find nigeriaLocations array in data/nigeria-locations.ts");
}

const arrayLiteral = source.slice(start, end + 1);
const locations = Function(`"use strict"; return (${arrayLiteral});`)();

if (!Array.isArray(locations)) {
  throw new Error("Parsed nigeriaLocations value is not an array.");
}

locations.sort((a, b) => String(a?.state ?? "").localeCompare(String(b?.state ?? "")));

const formattedArray = JSON.stringify(locations, null, 2).replace(/"(\w+)":/g, "$1:");
const updated = `${source.slice(0, start)}${formattedArray}${source.slice(end + 1)}`;

fs.writeFileSync(targetPath, updated, "utf8");
console.log("Sorted nigeriaLocations by state.");
