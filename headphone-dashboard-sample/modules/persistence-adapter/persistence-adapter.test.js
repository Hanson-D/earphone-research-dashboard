const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./persistence-adapter");

test("defaultDocumentPath normalizes project paths", () => {
  assert.equal(
    moduleApi.defaultDocumentPath("D:\\research\\project-a\\", "study-manifest"),
    "D:/research/project-a/manifest.json"
  );
});

test("createEnvelope and validateEnvelope accept valid manifest payloads", () => {
  const envelope = moduleApi.createEnvelope({
    documentType: "study-manifest",
    savedAt: "2026-06-25T00:00:00.000Z",
    payload: { studyName: "Headphone Fit", modules: ["sql-percentile"] }
  });
  assert.equal(envelope.schemaVersion, 1);
  assert.deepEqual(moduleApi.validateEnvelope(envelope), { valid: true, issues: [] });
});

test("validateEnvelope reports schema and payload issues", () => {
  const validation = moduleApi.validateEnvelope({
    documentType: "study-manifest",
    schemaVersion: 99,
    payload: { studyName: "Missing Modules" }
  });
  assert.deepEqual(validation, {
    valid: false,
    issues: ["unsupported-schema-version", "missing-payload-key:modules"]
  });
});

test("buildWriteOperation wraps payload and validates it", () => {
  const operation = moduleApi.buildWriteOperation({
    projectPath: "projects/a",
    documentType: "audit-log",
    payload: [{ id: "run-1" }],
    savedAt: "2026-06-25T00:00:00.000Z"
  });
  assert.equal(operation.action, "write-json");
  assert.equal(operation.path, "projects/a/audit-log.json");
  assert.equal(operation.validation.valid, true);
});

test("buildProjectPersistencePlan includes only provided documents", () => {
  const plan = moduleApi.buildProjectPersistencePlan({
    projectPath: "projects/a",
    manifest: { studyName: "A", modules: ["sql-percentile"] },
    settings: { theme: "red" },
    savedAt: "2026-06-25T00:00:00.000Z"
  });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.writes.map(item => item.path), [
    "projects/a/manifest.json",
    "projects/a/module-settings.json"
  ]);
});

test("serializeEnvelope returns readable JSON", () => {
  const envelope = moduleApi.createEnvelope({
    documentType: "project-registry",
    payload: []
  });
  assert.equal(JSON.parse(moduleApi.serializeEnvelope(envelope)).documentType, "project-registry");
});
