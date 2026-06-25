const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./integration-adapter");

test("buildIntegrationPlan expands sql-percentile assets and APIs", () => {
  const plan = moduleApi.buildIntegrationPlan(["sql-percentile", "module-orchestrator", "sql-percentile"]);
  assert.deepEqual(plan.modules, ["sql-percentile", "module-orchestrator"]);
  assert.ok(plan.staticFiles.includes("modules/sql-percentile/sql-percentile.js"));
  assert.ok(plan.staticFiles.includes("modules/module-orchestrator/module-orchestrator.js"));
  assert.deepEqual(plan.apiRoutes.map(route => `${route.method} ${route.path}`), [
    "GET /api/sqlite-schema",
    "POST /api/sqlite-percentiles"
  ]);
  assert.deepEqual(plan.pageEntries, [
    { id: "sql-percentile", label: "03 SQL Percentile", fragment: "modules/sql-percentile/sql-percentile-page.html" }
  ]);
});

test("validateIntegrationPlan reports missing modules", () => {
  const plan = moduleApi.buildIntegrationPlan(["missing-module"]);
  const validation = moduleApi.validateIntegrationPlan(plan);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missingModules, ["missing-module"]);
});

test("findDuplicates detects repeated values", () => {
  assert.deepEqual(moduleApi.findDuplicates(["a", "b", "a", "c", "b"]), ["a", "b"]);
});

test("planToChecklist renders actionable integration steps", () => {
  const plan = moduleApi.buildIntegrationPlan(["sql-percentile"]);
  const checklist = moduleApi.planToChecklist(plan);
  assert.match(checklist, /Serve static file: modules\/sql-percentile\/sql-percentile.js/);
  assert.match(checklist, /Mount API: GET \/api\/sqlite-schema/);
  assert.match(checklist, /Add page entry: 03 SQL Percentile/);
  assert.match(checklist, /Run: node --test modules\/sql-percentile\/sql-percentile.test.js/);
});
