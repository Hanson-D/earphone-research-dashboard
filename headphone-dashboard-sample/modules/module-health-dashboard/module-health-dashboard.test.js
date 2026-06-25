const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./module-health-dashboard");

const registry = {
  "sql-percentile": {
    label: "03 SQL percentile",
    entryFiles: ["sql-percentile/sql-percentile.js"],
    testCommands: ["node --test modules/sql-percentile/sql-percentile.test.js"]
  },
  "empty-module": {
    label: "Empty",
    entryFiles: [],
    testCommands: []
  },
  "failing-module": {
    label: "Failing",
    entryFiles: ["failing/index.js"],
    testCommands: ["node --test failing.test.js"]
  }
};

test("normalizeRegistry extracts module metadata", () => {
  const rows = moduleApi.normalizeRegistry(registry);
  assert.equal(rows[0].name, "sql-percentile");
  assert.equal(rows[0].fileCount, 1);
  assert.equal(rows[0].testCount, 1);
});

test("buildHealthRows merges test results and issues", () => {
  const rows = moduleApi.buildHealthRows(registry, {
    "sql-percentile": { status: "pass", passCount: 6, failCount: 0, durationMs: 100 },
    "failing-module": { status: "fail", passCount: 0, failCount: 1 }
  });
  assert.equal(rows.find(row => row.name === "sql-percentile").ready, true);
  assert.deepEqual(rows.find(row => row.name === "empty-module").issues, ["missing-entry-files", "missing-tests"]);
  assert.deepEqual(rows.find(row => row.name === "failing-module").issues, ["tests-failed"]);
});

test("buildHealthDashboard summarizes readiness", () => {
  const dashboard = moduleApi.buildHealthDashboard(registry, {
    "sql-percentile": { status: "pass" },
    "failing-module": { status: "fail" }
  });
  assert.deepEqual(dashboard.summary, {
    total: 3,
    ready: 1,
    failed: 1,
    missingTests: 1,
    readinessScore: 0.333
  });
  assert.deepEqual(dashboard.issues.map(issue => `${issue.module}:${issue.issue}`), [
    "empty-module:missing-entry-files",
    "empty-module:missing-tests",
    "failing-module:tests-failed"
  ]);
});

test("healthToMarkdown renders a maintainable summary", () => {
  const markdown = moduleApi.healthToMarkdown(moduleApi.buildHealthDashboard(registry, {
    "sql-percentile": { status: "pass" }
  }));
  assert.match(markdown, /# Module Health/);
  assert.match(markdown, /sql-percentile: pass/);
  assert.match(markdown, /empty-module: missing-tests/);
});
