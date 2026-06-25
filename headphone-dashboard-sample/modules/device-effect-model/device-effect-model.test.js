const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./device-effect-model");

test("buildDeviceEffects computes device means and global deltas", () => {
  const model = moduleApi.buildDeviceEffects([
    { device: "A", comfort: "7", stability: "8" },
    { device: "A", comfort: "9", stability: "8" },
    { device: "B", comfort: "5", stability: "6" },
    { device: "B", comfort: "", stability: "bad" }
  ], {
    deviceField: "device",
    metricFields: ["comfort", "stability"]
  });
  assert.equal(model.rowCount, 4);
  assert.equal(model.global.comfort.n, 3);
  assert.equal(model.global.comfort.mean, 7);
  assert.equal(model.devices[0].metrics.comfort.mean, 8);
  assert.equal(model.devices[0].metrics.comfort.deltaFromGlobal, 1);
  assert.equal(model.devices[1].metrics.stability.n, 1);
});

test("buildRankings sorts devices by metric mean", () => {
  const model = moduleApi.buildDeviceEffects([
    { device: "A", comfort: "7" },
    { device: "B", comfort: "9" },
    { device: "C", comfort: "9" }
  ], {
    metricFields: ["comfort"]
  });
  assert.deepEqual(model.rankings.comfort.map(item => item.device), ["B", "C", "A"]);
});

test("summarizeDeviceEffects returns compact text", () => {
  const model = moduleApi.buildDeviceEffects([
    { device: "A", comfort: "7" },
    { device: "B", comfort: "9" }
  ], {
    metricFields: ["comfort"]
  });
  assert.equal(moduleApi.summarizeDeviceEffects(model)[0], "comfort: best B (mean 9.00, delta 1.00, n=1)");
});
