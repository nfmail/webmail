#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

function fail(message) {
  console.error(`Toolchain check failed: ${message}`);
  process.exitCode = 1;
}

const expectedNode = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const expectedNpm = packageJson.packageManager?.match(/^npm@(.+)$/)?.[1];

if (!expectedNpm) {
  fail("package.json must contain an exact npm packageManager version");
} else {
  const actualNode = process.versions.node;
  const actualNpm = execFileSync("npm", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (actualNode !== expectedNode) {
    fail(`expected Node ${expectedNode}, received ${actualNode}`);
  }
  if (actualNpm !== expectedNpm) {
    fail(`expected npm ${expectedNpm}, received ${actualNpm}`);
  }

  if (process.exitCode !== 1) {
    console.log(`Toolchain check passed (Node ${actualNode}, npm ${actualNpm}).`);
  }
}
