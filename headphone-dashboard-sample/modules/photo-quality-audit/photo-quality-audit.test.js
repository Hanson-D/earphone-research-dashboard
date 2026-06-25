const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./photo-quality-audit");

test("auditPhotoCoverage reports missing views and coverage", () => {
  const audit = moduleApi.auditPhotoCoverage({
    records: [
      { name: "U001", device: "A", front_photo: "u001/a/front.jpg", side_photo: "" },
      { name: "U001", device: "B", front_photo: "u001/b/front.jpg", side_photo: "u001/b/side.jpg" }
    ],
    subjectField: "name",
    deviceField: "device",
    viewColumns: [
      { view: "front", column: "front_photo" },
      { view: "side", column: "side_photo" }
    ]
  });
  assert.equal(audit.expected, 4);
  assert.equal(audit.present, 3);
  assert.equal(audit.coverageRate, 0.75);
  assert.deepEqual(audit.missing, [
    { subject: "U001", device: "A", view: "side", column: "side_photo" }
  ]);
  assert.deepEqual(audit.subjectSummary, [
    { key: "U001", expected: 4, present: 3, missing: 1, coverageRate: 0.75 }
  ]);
});

test("auditPhotoCoverage detects duplicate photo paths", () => {
  const audit = moduleApi.auditPhotoCoverage({
    records: [
      { name: "U001", device: "A", front_photo: "same.jpg" },
      { name: "U002", device: "A", front_photo: "same.jpg" }
    ],
    viewColumns: [{ view: "front", column: "front_photo" }]
  });
  assert.equal(audit.duplicatePaths.length, 1);
  assert.equal(audit.duplicatePaths[0].path, "same.jpg");
});

test("formatCoverageRate formats percentage", () => {
  assert.equal(moduleApi.formatCoverageRate(0.756), "75.6%");
});
