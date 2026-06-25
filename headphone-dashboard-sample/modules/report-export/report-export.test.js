const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./report-export");

test("percentileBand classifies percentile ranges", () => {
  assert.equal(moduleApi.percentileBand(2), "very_low");
  assert.equal(moduleApi.percentileBand(20), "low");
  assert.equal(moduleApi.percentileBand(50), "middle");
  assert.equal(moduleApi.percentileBand(90), "high");
  assert.equal(moduleApi.percentileBand(99), "very_high");
});

test("buildReportModel normalizes percentile rows", () => {
  const model = moduleApi.buildReportModel({
    createdAt: "2026-06-25T00:00:00.000Z",
    subject: { name: "U001" },
    percentiles: [
      { dashboardField: "concha_width_mm", dbColumn: "concha_width", value: "24.5", percentile: "63.2", sampleSize: 10000 }
    ],
    notes: ["check photo", ""]
  });
  assert.deepEqual(model.percentiles[0], {
    field: "concha_width_mm",
    dbColumn: "concha_width",
    value: 24.5,
    percentile: 63.2,
    sampleSize: 10000,
    band: "middle"
  });
  assert.deepEqual(model.notes, ["check photo"]);
});

test("reportToCsv escapes cells", () => {
  const model = moduleApi.buildReportModel({
    percentiles: [
      { field: "width, mm", dbColumn: "concha_width", value: 24.5, percentile: 63.2, sampleSize: 10 }
    ]
  });
  assert.equal(
    moduleApi.reportToCsv(model),
    'field,dbColumn,value,percentile,sampleSize,band\n"width, mm",concha_width,24.5,63.2,10,middle'
  );
});

test("reportToHtml escapes dynamic values", () => {
  const model = moduleApi.buildReportModel({
    title: "Report <test>",
    createdAt: "2026-06-25T00:00:00.000Z",
    cohort: { label: "age < 40" },
    percentiles: [
      { field: "width<script>", dbColumn: "concha_width", value: 24.5, percentile: 63.2, sampleSize: 10 }
    ]
  });
  const html = moduleApi.reportToHtml(model);
  assert.match(html, /Report &lt;test&gt;/);
  assert.match(html, /age &lt; 40/);
  assert.doesNotMatch(html, /width<script>/);
});
