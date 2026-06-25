(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeviceEffectModelModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function numericValue(value) {
    const number = Number(value);
    return value !== "" && value != null && Number.isFinite(number) ? number : null;
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function sd(values) {
    if (values.length <= 1) return 0;
    const average = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  function groupByDevice(records = [], deviceField = "device") {
    const groups = new Map();
    for (const record of records) {
      const device = record[deviceField] || "unknown";
      if (!groups.has(device)) groups.set(device, []);
      groups.get(device).push(record);
    }
    return groups;
  }

  function metricValues(records = [], metricField) {
    return records
      .map(record => numericValue(record[metricField]))
      .filter(value => value != null);
  }

  function buildDeviceEffects(records = [], {
    deviceField = "device",
    metricFields = [],
  } = {}) {
    const groups = groupByDevice(records, deviceField);
    const global = {};
    for (const metric of metricFields) {
      const values = metricValues(records, metric);
      global[metric] = {
        n: values.length,
        mean: mean(values),
        sd: sd(values),
      };
    }

    const devices = [...groups.entries()].map(([device, rows]) => {
      const metrics = {};
      for (const metric of metricFields) {
        const values = metricValues(rows, metric);
        const metricMean = mean(values);
        metrics[metric] = {
          n: values.length,
          mean: metricMean,
          sd: sd(values),
          deltaFromGlobal: metricMean == null || global[metric].mean == null
            ? null
            : Number((metricMean - global[metric].mean).toFixed(6)),
        };
      }
      return { device, rowCount: rows.length, metrics };
    });

    return {
      deviceField,
      metricFields,
      rowCount: records.length,
      global,
      devices,
      rankings: buildRankings(devices, metricFields),
    };
  }

  function buildRankings(devices = [], metricFields = []) {
    const rankings = {};
    for (const metric of metricFields) {
      rankings[metric] = devices
        .filter(device => device.metrics[metric]?.mean != null)
        .map(device => ({
          device: device.device,
          mean: device.metrics[metric].mean,
          deltaFromGlobal: device.metrics[metric].deltaFromGlobal,
          n: device.metrics[metric].n,
        }))
        .sort((a, b) => b.mean - a.mean || a.device.localeCompare(b.device));
    }
    return rankings;
  }

  function summarizeDeviceEffects(model) {
    return (model.metricFields || []).map(metric => {
      const top = model.rankings?.[metric]?.[0];
      if (!top) return `${metric}: no numeric data`;
      return `${metric}: best ${top.device} (mean ${top.mean.toFixed(2)}, delta ${top.deltaFromGlobal.toFixed(2)}, n=${top.n})`;
    });
  }

  return {
    numericValue,
    mean,
    sd,
    groupByDevice,
    metricValues,
    buildDeviceEffects,
    buildRankings,
    summarizeDeviceEffects,
  };
});
