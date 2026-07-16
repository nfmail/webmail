#!/usr/bin/env node

import assert from "node:assert/strict";
import console from "node:console";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const ruleset = JSON.parse(
  readFileSync(new URL("../.github/rulesets/main.json", import.meta.url), "utf8"),
);

assert.equal(ruleset.target, "branch");
assert.equal(ruleset.enforcement, "active");
assert.deepEqual(ruleset.conditions?.ref_name?.include, ["~DEFAULT_BRANCH"]);

const rules = new Map(ruleset.rules.map((rule) => [rule.type, rule]));
assert.ok(rules.has("deletion"), "main must reject deletion");
assert.ok(rules.has("non_fast_forward"), "main must reject force-pushes");

const pullRequest = rules.get("pull_request")?.parameters;
assert.ok(pullRequest, "main must require pull requests");
assert.equal(pullRequest.dismiss_stale_reviews_on_push, true);
assert.equal(pullRequest.required_review_thread_resolution, true);

const statusChecks = rules.get("required_status_checks")?.parameters;
assert.ok(statusChecks, "main must require CI status checks");
assert.equal(statusChecks.strict_required_status_checks_policy, true);

const actualContexts = statusChecks.required_status_checks
  .map(({ context }) => context)
  .sort();
const expectedContexts = [
  "Browser smoke",
  "Production build",
  "Repository policy",
  "Typecheck, lint, and unit tests",
];
assert.deepEqual(actualContexts, expectedContexts);

console.log("Main ruleset configuration is valid.");
