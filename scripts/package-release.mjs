#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import console from "node:console";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const version = readFileSync("VERSION", "utf8").trim();
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const arch = process.env.ARCH;
const releaseTag = process.env.RELEASE_TAG ?? `v${version}`;
const epoch = process.env.SOURCE_DATE_EPOCH ?? execFileSync(
  "git",
  ["show", "-s", "--format=%ct", "HEAD"],
  { encoding: "utf8" },
).trim();

if (!/^\d+\.\d+\.\d+(?:-nf\.\d+)?$/.test(version)) {
  throw new Error(`Unsupported release version: ${version}`);
}
if (packageVersion !== version) {
  throw new Error(`VERSION (${version}) and package.json (${packageVersion}) differ`);
}
if (!/^(?:amd64|arm64)$/.test(arch ?? "")) {
  throw new Error(`ARCH must be amd64 or arm64, received: ${arch ?? "<empty>"}`);
}
if (releaseTag !== `v${version}`) {
  throw new Error(`Release tag ${releaseTag} does not match v${version}`);
}
if (!/^\d+$/.test(epoch)) {
  throw new Error(`Invalid SOURCE_DATE_EPOCH: ${epoch}`);
}
if (!existsSync(".next/standalone")) {
  throw new Error("Missing .next/standalone; run npm run build first");
}

const repository = process.env.GITHUB_REPOSITORY ?? "nfmail/webmail";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const upstreamVersion = version.replace(/-nf\.\d+$/, "");
const upstreamCommit = execFileSync(
  "git",
  ["rev-parse", `${upstreamVersion}^{commit}`],
  { encoding: "utf8" },
).trim();
const releaseDir = path.resolve(process.env.RELEASE_DIR ?? ".release");
const bundle = `nf-mail-${version}-linux-${arch}`;
const bundleRoot = path.join(releaseDir, bundle);
const tarball = path.join(releaseDir, `${bundle}.tar.gz`);
const sourceManifest = path.join(releaseDir, `${bundle}.source.json`);
const sbom = path.join(releaseDir, `${bundle}.spdx.json`);
const checksums = path.join(releaseDir, `${bundle}.SHA256SUMS`);
const sourceUrl = `https://github.com/${repository}/tree/${releaseTag}`;

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });
cpSync(".next/standalone", bundleRoot, { recursive: true });
cpSync(".next/static", path.join(bundleRoot, ".next/static"), { recursive: true });
cpSync("public", path.join(bundleRoot, "public"), { recursive: true });
for (const filename of ["LICENSE", "NOTICE", "VERSION"]) {
  copyFileSync(filename, path.join(bundleRoot, filename));
}

const metadata = {
  artifact: `${bundle}.tar.gz`,
  architecture: arch,
  build: {
    commit,
    sourceDateEpoch: Number(epoch),
  },
  source: {
    repository: `https://github.com/${repository}`,
    tag: releaseTag,
    url: sourceUrl,
  },
  upstream: {
    commit: upstreamCommit,
    repository: "https://github.com/bulwarkmail/webmail",
    version: upstreamVersion,
  },
  version,
};
const metadataJson = `${JSON.stringify(metadata, null, 2)}\n`;
writeFileSync(sourceManifest, metadataJson);
writeFileSync(path.join(bundleRoot, "SOURCE.json"), metadataJson);

execFileSync("tar", [
  "--sort=name",
  `--mtime=@${epoch}`,
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  "-czf",
  tarball,
  "-C",
  releaseDir,
  bundle,
], { stdio: "inherit" });

const outputs = { TARBALL: tarball, SOURCE_MANIFEST: sourceManifest, SBOM: sbom, CHECKSUMS: checksums };
if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    `${Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
  );
}
for (const [key, value] of Object.entries(outputs)) {
  console.log(`${key}=${value}`);
}
