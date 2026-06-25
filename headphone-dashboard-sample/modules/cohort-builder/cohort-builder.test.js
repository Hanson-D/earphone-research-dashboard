const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./cohort-builder");

test("normalizeFilters removes unusable filters and sorts between bounds", () => {
  const filters = moduleApi.normalizeFilters([
    { column: "age", operator: "between", value: [45, 20] },
    { column: "ear_side", operator: "equals", value: "left" },
    { column: "empty", operator: "equals", value: "" },
    { column: "bad", operator: "unknown", value: "x" }
  ]);
  assert.deepEqual(filters, [
    { column: "age", operator: "between", value: [20, 45] },
    { column: "ear_side", operator: "equals", value: "left" }
  ]);
});

test("deriveFiltersFromSubject creates equality filters for selected fields", () => {
  const filters = moduleApi.deriveFiltersFromSubject(
    { name: "U001", ear_side: "right", sex: "female", prototype: "" },
    ["ear_side", "sex", "prototype"]
  );
  assert.deepEqual(filters, [
    { column: "ear_side", operator: "equals", value: "right" },
    { column: "sex", operator: "equals", value: "female" }
  ]);
});

test("buildCohortSummary describes normalized filters", () => {
  const summary = moduleApi.buildCohortSummary([
    { column: "age", operator: "between", value: [40, 20] },
    { column: "ear_side", operator: "equals", value: "left" }
  ], 532);
  assert.equal(summary.label, "age: 20-40; ear_side: left");
  assert.equal(summary.sampleSize, 532);
  assert.equal(summary.filterCount, 2);
});
