#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const [output, ...files] = process.argv.slice(2);
if (!output || files.length === 0) {
  throw new Error("usage: generate-checksums.mjs <output-file> <artifact>...");
}

const lines = files
  .map((file) => `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${path.basename(file)}`)
  .sort();
writeFileSync(output, `${lines.join("\n")}\n`);
