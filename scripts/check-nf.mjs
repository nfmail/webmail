#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import console from "node:console";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function listExcludedTrackedFiles(root = process.cwd()) {
  const policyFile = resolve(root, ".nfignore");
  if (!existsSync(policyFile)) {
    throw new Error("Required project configuration is missing");
  }

  const output = execFileSync(
    "git",
    [
      "-c",
      "core.ignoreCase=true",
      "-C",
      root,
      "ls-files",
      "--cached",
      "--ignored",
      `--exclude-from=${policyFile}`,
      "-z",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return output.split("\0").filter(Boolean);
}

function run() {
  const rootArgumentIndex = process.argv.indexOf("--root");
  const root = rootArgumentIndex === -1 ? process.cwd() : process.argv[rootArgumentIndex + 1];

  if (!root) {
    console.error("NF validation could not start.");
    process.exitCode = 2;
    return;
  }

  let excludedFiles;
  try {
    excludedFiles = listExcludedTrackedFiles(root);
  } catch {
    console.error("NF validation could not complete.");
    process.exitCode = 2;
    return;
  }

  if (excludedFiles.length === 0) {
    console.log("NF validation passed.");
    return;
  }

  console.error("NF validation failed for tracked paths:");
  for (const filePath of excludedFiles) {
    console.error(`- ${filePath}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
