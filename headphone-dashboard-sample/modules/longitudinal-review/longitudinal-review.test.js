const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./longitudinal-review");

test("groupRecords groups rows by subject", () => {
  const groups = moduleApi.groupRecords([
    { name: "U001", device: "A" },
    { name: "U002", device: "A" },
    { name: "U001", device: "B" }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].subject, "U001");
  assert.equal(groups[0].rows.length, 2);
});

test("bestCondition picks the highest numeric metric", () => {
  const best = moduleApi.bestCondition([
    { device: "A", comfort: "7" },
    { device: "B", comfort: "9" },
    { device: "C", comfort: "" }
  ], "device", "comfort");
  assert.deepEqual({ condition: best.condition, value: best.value }, { condition: "B", value: 9 });
});

test("pairwiseDeltas computes metric changes between conditions", () => {
  const deltas = moduleApi.pairwiseDeltas([
    { device: "A", comfort: "7", stability: "8" },
    { device: "B", comfort: "9", stability: "6" }
  ], "device", ["comfort", "stability"]);
  assert.deepEqual(deltas, [
    { metric: "comfort", fromCondition: "A", toCondition: "B", fromValue: 7, toValue: 9, delta: 2 },
    { metric: "stability", fromCondition: "A", toCondition: "B", fromValue: 8, toValue: 6, delta: -2 }
  ]);
});

test("buildLongitudinalReview creates subject summaries", () => {
  const review = moduleApi.buildLongitudinalReview([
    { name: "U001", device: "A", comfort: "7", stability: "8" },
    { name: "U001", device: "B", comfort: "9", stability: "6" },
    { name: "U002", device: "A", comfort: "5", stability: "5" }
  ], {
    subjectField: "name",
    conditionField: "device",
    metricFields: ["comfort", "stability"]
  });
  assert.equal(review.length, 2);
  assert.deepEqual(review[0].bestByMetric.comfort, { condition: "B", value: 9 });
  assert.equal(review[0].deltas.length, 2);
});
