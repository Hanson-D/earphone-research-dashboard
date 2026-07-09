const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./base-app-bridge");

const integrationPlan = {
  modules: ["sql-percentile"],
  staticFiles: [
    "modules/sql-percentile/sql-percentile.js",
    "modules/sql-percentile/sql-percentile.css",
    "modules/sql-percentile/sql-percentile-page.html"
  ],
  apiRoutes: [
    { method: "GET", path: "/api/sqlite-schema", handler: "sql_percentile_api.schema_response" },
    { method: "POST", path: "/api/sqlite-percentiles", handler: "sql_percentile_api.percentile_response" }
  ],
  pageEntries: [
    { id: "sql-percentile", label: "03 SQL Percentile", fragment: "modules/sql-percentile/sql-percentile-page.html" }
  ],
  testCommands: ["node --test modules/sql-percentile/sql-percentile.test.js"]
};

test("buildPatchPlan maps integration plan to base app patch descriptions", () => {
  const plan = moduleApi.buildPatchPlan(integrationPlan);
  assert.equal(plan.modules[0], "sql-percentile");
  assert.ok(plan.patches.some(patch => patch.type === "insert-page-entry" && patch.target.endsWith("index.html")));
  assert.ok(plan.patches.some(patch => patch.type === "register-page-controller" && patch.target.endsWith("app.js")));
  assert.equal(plan.patches.filter(patch => patch.type === "mount-api-route").length, 2);
  assert.deepEqual(plan.validationCommands, ["node --test modules/sql-percentile/sql-percentile.test.js"]);
});

test("validatePatchPlan catches incomplete API route patches", () => {
  const plan = {
    patches: [{
      target: "server/server.py",
      type: "mount-api-route",
      summary: "bad route",
      payload: { method: "GET", path: "/api/test" }
    }]
  };
  const validation = moduleApi.validatePatchPlan(plan);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.routeIssues, ["bad route"]);
});

test("patchPlanToMarkdown renders patch and validation sections", () => {
  const markdown = moduleApi.patchPlanToMarkdown(moduleApi.buildPatchPlan(integrationPlan));
  assert.match(markdown, /# Base App Bridge Plan/);
  assert.match(markdown, /Mount GET \/api\/sqlite-schema/);
  assert.match(markdown, /node --test modules\/sql-percentile\/sql-percentile.test.js/);
});
