const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./visual-grammar");

test("statusBadge maps known and unknown statuses", () => {
  assert.deepEqual(moduleApi.statusBadge("warning"), {
    status: "warning",
    label: "需复核",
    tone: "warning"
  });
  assert.deepEqual(moduleApi.statusBadge("missing", "自定义"), {
    status: "missing",
    label: "自定义",
    tone: "muted"
  });
});

test("percentileBand classifies percentile values", () => {
  assert.deepEqual(moduleApi.percentileBand(2), { band: "very-low", label: "极低", tone: "low-critical" });
  assert.deepEqual(moduleApi.percentileBand(50), { band: "middle", label: "中间", tone: "neutral" });
  assert.deepEqual(moduleApi.percentileBand(99), { band: "very-high", label: "极高", tone: "high-critical" });
  assert.equal(moduleApi.percentileBand("bad").band, "unknown");
});

test("buildTableModel creates aligned cells", () => {
  const table = moduleApi.buildTableModel([
    { id: "row-1", field: "comfort", value: 8 }
  ], [
    { key: "field", label: "Field" },
    { key: "value", label: "Value", numeric: true }
  ]);
  assert.equal(table.columns[1].align, "right");
  assert.deepEqual(table.rows[0].cells, [
    { key: "field", value: "comfort", align: "left" },
    { key: "value", value: 8, align: "right" }
  ]);
});

test("buildBarChartModel normalizes widths", () => {
  const chart = moduleApi.buildBarChartModel([
    { device: "A", score: 5 },
    { device: "B", score: 10 }
  ], {
    labelKey: "device",
    valueKey: "score",
    seriesLabel: "Comfort",
    domain: [0, 10]
  });
  assert.deepEqual(chart.domain, { min: 0, max: 10 });
  assert.deepEqual(chart.bars.map(bar => bar.widthRatio), [0.5, 1]);
});

test("buildLegend and formatMetric return compact display values", () => {
  assert.deepEqual(moduleApi.buildLegend([{ key: "high", label: "偏高", tone: "high" }]), [
    { key: "high", label: "偏高", tone: "high" }
  ]);
  assert.equal(moduleApi.formatMetric(1.234), "1.23");
  assert.equal(moduleApi.formatMetric("bad"), "—");
});
