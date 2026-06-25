const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./protocol-template");

test("validateProtocol reports missing fields and numeric range issues", () => {
  const validation = moduleApi.validateProtocol(
    [
      { name: "U001", device: "A", satisfaction: "8" },
      { name: "U002", device: "B", satisfaction: "12" },
      { name: "U003", device: "B", satisfaction: "bad" }
    ],
    {
      name: "Headphone Fit Study",
      requiredFields: ["name", "device", "ear_side"],
      recommendedFields: ["age"],
      numericRanges: { satisfaction: [0, 10] }
    }
  );
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.missingRequiredFields, ["ear_side"]);
  assert.deepEqual(validation.missingRecommendedFields, ["age"]);
  assert.equal(validation.rangeIssues.length, 2);
  assert.equal(validation.rangeIssues[0].message, "out_of_range");
  assert.equal(validation.rangeIssues[1].message, "not_numeric");
});

test("buildPhotoViewColumns creates columns for photo audit", () => {
  assert.deepEqual(moduleApi.buildPhotoViewColumns(["front", "side"]), [
    { view: "front", column: "front_photo" },
    { view: "side", column: "side_photo" }
  ]);
});

test("summarizeValidation creates compact status text", () => {
  const validation = moduleApi.validateProtocol(
    [{ name: "U001", device: "A", ear_side: "left", comfort: "8" }],
    {
      name: "Protocol A",
      requiredFields: ["name", "device", "ear_side"],
      numericRanges: { comfort: [0, 10] }
    }
  );
  assert.equal(moduleApi.summarizeValidation(validation), "Protocol A: valid (1 rows)");
});
