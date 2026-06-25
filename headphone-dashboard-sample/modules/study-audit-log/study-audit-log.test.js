const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./study-audit-log");

test("createAuditEntry builds a reproducible run entry", () => {
  const entry = moduleApi.createAuditEntry({
    projectId: "Headphone Fit",
    module: "sql-percentile",
    subjectId: "U001",
    createdAt: "2026-06-25T12:30:45.000Z",
    cohort: { label: "ear_side: left", sampleSize: 532 },
    output: { results: [{ field: "width" }], warnings: [{ message: "check mapping" }] },
    artifacts: [{ type: "csv", path: "exports/u001.csv" }]
  });
  assert.equal(entry.id, "headphone-fit__sql-percentile__u001__20260625123045");
  assert.deepEqual(entry.summary, { resultCount: 1, warningCount: 1, artifactCount: 1 });
  assert.equal(entry.warnings[0].message, "check mapping");
});

test("appendAuditEntry upserts by id and sorts recent first", () => {
  const first = moduleApi.createAuditEntry({
    id: "same",
    projectId: "p",
    module: "a",
    createdAt: "2026-06-24T00:00:00.000Z"
  });
  const replacement = moduleApi.createAuditEntry({
    id: "same",
    projectId: "p",
    module: "b",
    createdAt: "2026-06-26T00:00:00.000Z"
  });
  const older = moduleApi.createAuditEntry({
    id: "older",
    projectId: "p",
    module: "c",
    createdAt: "2026-06-25T00:00:00.000Z"
  });
  const log = moduleApi.appendAuditEntry(moduleApi.appendAuditEntry([first], older), replacement);
  assert.deepEqual(log.map(item => item.id), ["same", "older"]);
  assert.equal(log[0].module, "b");
});

test("queryAuditLog filters by project, module, subject, and warnings", () => {
  const log = [
    moduleApi.createAuditEntry({ id: "a", projectId: "p1", module: "sql-percentile", subjectId: "U001", output: { warnings: [] } }),
    moduleApi.createAuditEntry({ id: "b", projectId: "p1", module: "report-export", subjectId: "U001", output: { warnings: [{ message: "x" }] } }),
    moduleApi.createAuditEntry({ id: "c", projectId: "p2", module: "sql-percentile", subjectId: "U002", output: { warnings: [] } })
  ];
  assert.deepEqual(moduleApi.queryAuditLog(log, { projectId: "p1" }).map(item => item.id), ["a", "b"]);
  assert.deepEqual(moduleApi.queryAuditLog(log, { module: "sql-percentile" }).map(item => item.id), ["a", "c"]);
  assert.deepEqual(moduleApi.queryAuditLog(log, { subjectId: "U001", hasWarnings: true }).map(item => item.id), ["b"]);
});

test("auditLogToCsv and auditLogToJson export summaries", () => {
  const log = [
    moduleApi.createAuditEntry({
      id: "a,b",
      projectId: "p1",
      module: "sql-percentile",
      subjectId: "U001",
      createdAt: "2026-06-25T00:00:00.000Z",
      output: { resultCount: 2, warningCount: 0 }
    })
  ];
  assert.match(moduleApi.auditLogToCsv(log), /"a,b",p1,sql-percentile,U001/);
  assert.equal(JSON.parse(moduleApi.auditLogToJson(log))[0].id, "a,b");
});

test("summarizeAuditLog returns compact metadata", () => {
  const log = [
    moduleApi.createAuditEntry({ id: "a", module: "report-export", createdAt: "2026-06-26T00:00:00.000Z", output: { warnings: [] } }),
    moduleApi.createAuditEntry({ id: "b", module: "sql-percentile", createdAt: "2026-06-25T00:00:00.000Z", output: { warnings: [{ message: "x" }] } })
  ];
  assert.deepEqual(moduleApi.summarizeAuditLog(log), {
    runCount: 2,
    warningRuns: 1,
    modules: ["report-export", "sql-percentile"],
    latestRunAt: "2026-06-26T00:00:00.000Z"
  });
});
