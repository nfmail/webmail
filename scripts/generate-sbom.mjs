#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const output = process.argv[2];
const arch = process.env.ARCH;
const epoch = process.env.SOURCE_DATE_EPOCH;
const releaseTag = process.env.RELEASE_TAG;
const version = readFileSync("VERSION", "utf8").trim();

if (!output) throw new Error("usage: generate-sbom.mjs <output-file>");
if (!/^(?:amd64|arm64)$/.test(arch ?? "")) throw new Error("ARCH must be amd64 or arm64");
if (!/^\d+$/.test(epoch ?? "")) throw new Error("SOURCE_DATE_EPOCH must be an integer");
if (releaseTag !== `v${version}`) throw new Error(`Release tag must be v${version}`);

const sbom = JSON.parse(execFileSync(
  "npm",
  ["sbom", "--sbom-format", "spdx", "--sbom-type", "application", "--package-lock-only"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
));
const repository = process.env.GITHUB_REPOSITORY ?? "nfmail/webmail";
sbom.name = `nf-mail-${version}-linux-${arch}`;
sbom.documentNamespace = `https://github.com/${repository}/releases/tag/${releaseTag}/sbom/${arch}`;
sbom.creationInfo.created = new Date(Number(epoch) * 1000).toISOString();
writeFileSync(output, `${JSON.stringify(sbom, null, 2)}\n`);
