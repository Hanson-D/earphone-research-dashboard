const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./study-dashboard-packager");

test("buildManifest expands selected modules into files and test commands", () => {
  const manifest = moduleApi.buildManifest({
    studyName: "Headphone Fit Study",
    createdAt: "2026-06-25T00:00:00.000Z",
    modules: ["sql-percentile", "report-export", "sql-percentile"],
    resources: [{ type: "sqlite", path: "data/ear.sqlite" }],
    entryPoints: ["index.html"]
  });
  assert.deepEqual(manifest.modules, ["sql-percentile", "report-export"]);
  assert.ok(manifest.files.includes("sql-percentile/sql-percentile.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/report-export/report-export.test.js"));
  assert.equal(manifest.moduleDetails[0].available, true);
});

test("validateManifest reports missing modules and missing resource paths", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["unknown-module"],
    resources: [{ type: "csv", path: "" }],
    entryPoints: []
  });
  const validation = moduleApi.validateManifest(manifest);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missingModules, ["unknown-module"]);
  assert.deepEqual(validation.missingResourcePaths, ["csv"]);
  assert.deepEqual(validation.missingEntryPoints, ["entryPoints"]);
});

test("manifestToMarkdown renders a compact package summary", () => {
  const manifest = moduleApi.buildManifest({
    studyName: "Headphone Fit Study",
    createdAt: "2026-06-25T00:00:00.000Z",
    modules: ["annotation-review"],
    resources: [{ type: "csv", path: "data/headphone.csv" }],
    entryPoints: ["index.html"]
  });
  const markdown = moduleApi.manifestToMarkdown(manifest);
  assert.match(markdown, /# Headphone Fit Study Package/);
  assert.match(markdown, /annotation-review: 10 annotation review/);
  assert.match(markdown, /node --test modules\/annotation-review\/annotation-review.test.js/);
});

test("module-orchestrator is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["module-orchestrator"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("module-orchestrator/module-orchestrator.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/module-orchestrator/module-orchestrator.test.js"));
});

test("local-project-registry is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["local-project-registry"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("local-project-registry/local-project-registry.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/local-project-registry/local-project-registry.test.js"));
});

test("study-audit-log is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["study-audit-log"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("study-audit-log/study-audit-log.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/study-audit-log/study-audit-log.test.js"));
});

test("integration-adapter is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["integration-adapter"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("integration-adapter/integration-adapter.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/integration-adapter/integration-adapter.test.js"));
});

test("visual-grammar is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["visual-grammar"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("visual-grammar/visual-grammar.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/visual-grammar/visual-grammar.test.js"));
});

test("module-health-dashboard is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["module-health-dashboard"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("module-health-dashboard/module-health-dashboard.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/module-health-dashboard/module-health-dashboard.test.js"));
});

test("base-app-bridge is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["base-app-bridge"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("base-app-bridge/base-app-bridge.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/base-app-bridge/base-app-bridge.test.js"));
});

test("persistence-adapter is available for packaging", () => {
  const manifest = moduleApi.buildManifest({
    modules: ["persistence-adapter"],
    entryPoints: ["index.html"]
  });
  assert.equal(manifest.moduleDetails[0].available, true);
  assert.ok(manifest.files.includes("persistence-adapter/persistence-adapter.js"));
  assert.ok(manifest.testCommands.includes("node --test modules/persistence-adapter/persistence-adapter.test.js"));
});
