// Dependency audit. Run with `npm run audit`; add --json for machine output.
// FAIL gates the build, WARN is advisory. No dependencies of its own, by design.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// Packages allowed to run code at install time. Anything new here is a red flag
// worth reading before you approve it.
const ALLOWED_INSTALL_SCRIPTS = ["fsevents", "@parcel/watcher"];

// Known-unfixable advisories we've triaged and accepted, so the run stays green
// and a genuinely new CVE still turns it red. Re-check on the review date.
const ACCEPTED_CVES = {
  "lodash-es": "via @excalidraw/excalidraw → mermaid-to-excalidraw → langium; no in-semver fix. Review 2026-11",
  nanoid: "@excalidraw/excalidraw pins nanoid@3; fix is a breaking downgrade to 0.17.6. Review 2026-11",
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const entries = Object.entries(lock.packages ?? {});
const jsonMode = process.argv.includes("--json");

const results = [];
const check = (name, level, ok, detail) => results.push({ name, level: ok ? "pass" : level, detail });

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return e.stdout?.toString() ?? "";
  }
};

// ── 1. Known CVEs ──────────────────────────────────────────────────────────
const audit = JSON.parse(sh("npm audit --json") || "{}");
const sev = audit.metadata?.vulnerabilities ?? {};
const severe = Object.values(audit.vulnerabilities ?? {})
  .filter((v) => v.severity === "high" || v.severity === "critical")
  .map((v) => v.name);
const unaccepted = severe.filter((n) => !(n in ACCEPTED_CVES));
const stale = Object.keys(ACCEPTED_CVES).filter((n) => !severe.includes(n));
check(
  "CVEs",
  "fail",
  unaccepted.length === 0,
  unaccepted.length
    ? `${unaccepted.length} new high/critical: ${unaccepted.join(", ")}`
    : `${sev.moderate ?? 0} moderate, ${severe.length} high accepted` +
        (stale.length ? ` — drop from ACCEPTED_CVES: ${stale.join(", ")}` : ""),
);

// ── 2. Registry signatures & provenance ────────────────────────────────────
const sigs = sh("npm audit signatures 2>&1");
const bad = /(\d+) package\(?s?\)? have (?:missing|invalid)/i.exec(sigs);
check(
  "Signatures",
  "fail",
  !bad,
  bad ? bad[0] : (/(\d+) packages have verified registry signatures/.exec(sigs)?.[1] ?? "?") + " verified",
);

// ── 3. Install-time code execution ─────────────────────────────────────────
const installers = entries.filter(([, v]) => v.hasInstallScript).map(([p]) => p.split("node_modules/").pop());
const unexpected = installers.filter((p) => !ALLOWED_INSTALL_SCRIPTS.includes(p));
check(
  "Install scripts",
  "fail",
  unexpected.length === 0,
  unexpected.length ? `UNAPPROVED: ${unexpected.join(", ")}` : `${installers.length} known (${installers.join(", ")})`,
);

// ── 4. Lockfile provenance ─────────────────────────────────────────────────
let noIntegrity = 0;
const offRegistry = [];
for (const [p, v] of entries) {
  if (!p || v.link) continue;
  if (!v.integrity) noIntegrity++;
  if (v.resolved && !v.resolved.startsWith("https://registry.npmjs.org/")) offRegistry.push(p);
}
check(
  "Lockfile provenance",
  "fail",
  noIntegrity === 0 && offRegistry.length === 0,
  noIntegrity === 0 && offRegistry.length === 0
    ? `${entries.length} entries, all hashed & from npm`
    : `${noIntegrity} unhashed, ${offRegistry.length} off-registry: ${offRegistry.join(", ")}`,
);

// ── 5. Lockfile matches package.json ───────────────────────────────────────
const root = lock.packages?.[""] ?? {};
const drift = [];
for (const kind of ["dependencies", "devDependencies"]) {
  for (const [d, range] of Object.entries(pkg[kind] ?? {})) {
    if (root[kind]?.[d] !== range) drift.push(`${d} (${kind})`);
  }
}
check(
  "Lockfile in sync",
  "fail",
  drift.length === 0,
  drift.length ? `stale: ${drift.join(", ")}` : "matches package.json",
);

// ── 6. Declared runtime deps nothing imports ───────────────────────────────
// Scans src/ plus root config files, so build-only deps (e.g. @tailwindcss/vite,
// imported from vite.config.ts) don't get reported as unused.
const haystack = [];
const collect = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (/\.(tsx?|jsx?|css|html|json)$/.test(e.name)) haystack.push(readFileSync(p, "utf8"));
  }
};
collect("src");
for (const f of readdirSync(".")) {
  if (/\.(config\.[tj]s|html|json)$/.test(f) && statSync(f).isFile()) haystack.push(readFileSync(f, "utf8"));
}
const blob = haystack.join("\n");
const unused = Object.keys(pkg.dependencies ?? {}).filter((d) => !blob.includes(d));
check("Unused runtime deps", "warn", unused.length === 0, unused.length ? unused.join(", ") : "all imported");

// ── 7. Deprecated packages ─────────────────────────────────────────────────
const deprecated = entries
  .filter(([, v]) => v.deprecated)
  .map(([p, v]) => `${p.split("node_modules/").pop()}@${v.version}`);
check("Deprecated", "warn", deprecated.length === 0, deprecated.length ? deprecated.join(", ") : "none");

// ── 8. Licenses ────────────────────────────────────────────────────────────
const licenses = {};
const risky = [];
const walkLicenses = (dir, depth = 0) => {
  if (depth > 3 || !existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (e.name.startsWith("@")) {
      walkLicenses(p, depth);
      continue;
    }
    try {
      const j = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
      let l = j.license ?? j.licenses?.[0]?.type ?? "UNKNOWN";
      if (typeof l === "object") l = l.type ?? "UNKNOWN";
      licenses[l] = (licenses[l] ?? 0) + 1;
      if (/A?GPL|SSPL|CC-BY-NC|UNKNOWN/i.test(l) && !/LGPL/i.test(l)) risky.push(`${j.name}: ${l}`);
    } catch {}
    walkLicenses(join(p, "node_modules"), depth + 1);
  }
};
walkLicenses("node_modules");
check(
  "Licenses",
  "warn",
  risky.length === 0,
  risky.length ? risky.join(", ") : `${Object.keys(licenses).length} kinds, all permissive`,
);

// ── 9. Major versions behind (informational) ───────────────────────────────
const outdated = JSON.parse(sh("npm outdated --json") || "{}");
// For 0.x releases the minor is the breaking segment, so compare that instead.
const breakingSegment = (v) => (v.startsWith("0.") ? v.split(".").slice(0, 2).join(".") : v.split(".")[0]);
const majors = Object.entries(outdated)
  .filter(([, v]) => v.current && v.latest && breakingSegment(v.current) !== breakingSegment(v.latest))
  .map(([n, v]) => `${n} ${v.current}→${v.latest}`);
check("Major upgrades available", "warn", majors.length === 0, majors.length ? majors.join(", ") : "all current");

// ── 10. Install-script hardening still in place ────────────────────────────
const npmrc = existsSync(".npmrc") ? readFileSync(".npmrc", "utf8") : "";
const hardened = /^\s*ignore-scripts\s*=\s*true/m.test(npmrc);
check(
  "ignore-scripts",
  "fail",
  hardened,
  hardened ? ".npmrc blocks install-time scripts" : "MISSING from .npmrc — dependencies can run code on install",
);

// ── Report ─────────────────────────────────────────────────────────────────
if (jsonMode) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const mark = { pass: "\x1b[32mPASS\x1b[0m", warn: "\x1b[33mWARN\x1b[0m", fail: "\x1b[31mFAIL\x1b[0m" };
  console.log("\n  Dependency audit\n");
  for (const r of results) console.log(`  ${mark[r.level]}  ${r.name.padEnd(26)} ${r.detail}`);
  console.log("");
}
process.exit(results.some((r) => r.level === "fail") ? 1 : 0);
