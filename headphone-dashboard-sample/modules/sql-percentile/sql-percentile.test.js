const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./sql-percentile");

test("suggestMappings matches numeric subject fields to numeric database columns", () => {
  const subject = {
    user_id: "U001",
    concha_width_mm: "24.5",
    age: "32",
    comment: "ok"
  };
  const mappings = moduleApi.suggestMappings(subject, [
    { name: "concha_width", numeric: true },
    { name: "age", numeric: true },
    { name: "comment", numeric: false }
  ]);
  assert.equal(mappings[0].dashboardField, "concha_width_mm");
  assert.equal(mappings[0].value, 24.5);
  assert.equal(mappings[0].dbColumn, "concha_width");
  assert.equal(mappings[0].matchReason, "contains");
  assert.deepEqual(mappings[0].candidates[0], {
    dbColumn: "concha_width",
    confidence: 0.88,
    matchReason: "contains"
  });
  assert.equal(mappings[1].dbColumn, "age");
  assert.equal(mappings[1].confidence, 1);
});

test("suggestMappings handles camelCase dashboard fields", () => {
  const mappings = moduleApi.suggestMappings(
    { conchaWidthMm: "25.1", earCanalDepth: "11.2" },
    [
      { name: "concha_width", numeric: true },
      { name: "ear_canal_depth_mm", numeric: true }
    ]
  );
  assert.equal(mappings[0].dbColumn, "concha_width");
  assert.equal(mappings[1].dbColumn, "ear_canal_depth_mm");
  assert.ok(mappings[1].confidence >= 0.88);
});

test("buildPercentileRequest keeps only usable numeric mappings", () => {
  const request = moduleApi.buildPercentileRequest({
    databasePath: "ear.sqlite",
    table: "ear_data",
    cohortFilters: [{ column: "ear_side", operator: "equals", value: "left" }],
    mappings: [
      { dashboardField: "age", dbColumn: "age", value: "30" },
      { dashboardField: "comment", dbColumn: "comment", value: "ok" },
      { dashboardField: "missing", dbColumn: "", value: "12" }
    ]
  });
  assert.deepEqual(request, {
    databasePath: "ear.sqlite",
    table: "ear_data",
    cohortFilters: [{ column: "ear_side", operator: "equals", value: "left" }],
    mappings: [{ dashboardField: "age", dbColumn: "age", value: 30 }]
  });
});

test("buildResultCards prepares a stable display model", () => {
  const cards = moduleApi.buildResultCards([
    {
      dashboardField: "concha_width_mm",
      dbColumn: "concha_width",
      value: 24.5,
      percentile: 82.25,
      sampleSize: 100,
      mean: 22,
      sd: 2.5,
      min: 15,
      max: 30,
      rank: 82
    }
  ]);
  assert.equal(cards[0].title, "concha_width_mm");
  assert.equal(cards[0].percentileLabel, "P82.3");
  assert.equal(cards[0].band, "high");
  assert.deepEqual(cards[0].metrics[0], { label: "当前值", value: "24.50" });
});

test("buildAnalysisPackage includes explanations and summary", () => {
  const results = [{
    dashboardField: "concha_width_mm",
    dbColumn: "concha_width",
    value: 24.5,
    percentile: 82.25,
    sampleSize: 100,
    mean: 22,
    sd: 2.5,
    min: 15,
    max: 30,
    rank: 82,
    cohortFiltered: true
  }];
  const pack = moduleApi.buildAnalysisPackage({
    subject: { name: "U001" },
    mappings: [{ dashboardField: "concha_width_mm", dbColumn: "concha_width" }],
    results,
    cohort: { filterCount: 1 }
  });
  assert.equal(pack.summary.mappedFieldCount, 1);
  assert.equal(pack.summary.resultCount, 1);
  assert.equal(pack.summary.cohortFiltered, true);
  assert.match(pack.explanations[0], /concha_width_mm/);
  assert.match(pack.explanations[0], /P82.3/);
});

test("analysisPackageToCsv and serializeAnalysisPackage export stable artifacts", () => {
  const pack = moduleApi.buildAnalysisPackage({
    createdAt: "2026-06-25T00:00:00.000Z",
    subject: { name: "U001" },
    results: [{
      dashboardField: "width, mm",
      dbColumn: "concha_width",
      value: 24.5,
      percentile: 82.25,
      sampleSize: 100,
      mean: 22,
      sd: 2.5,
      rank: 82
    }]
  });
  const csv = moduleApi.analysisPackageToCsv(pack);
  assert.match(csv, /^field,dbColumn,value,percentile,sampleSize,mean,sd,rank,explanation/);
  assert.match(csv, /"width, mm",concha_width,24.50,82.3,100,22.00,2.50,82/);
  const json = moduleApi.serializeAnalysisPackage(pack);
  assert.equal(JSON.parse(json).subject.name, "U001");
});
