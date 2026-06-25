(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PhotoQualityAuditModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function hasValue(value) {
    return value !== "" && value != null;
  }

  function auditPhotoCoverage({
    records = [],
    subjectField = "name",
    deviceField = "device",
    viewColumns = [],
  } = {}) {
    const missing = [];
    const duplicatePaths = [];
    const seenPaths = new Map();
    const subjectSummary = new Map();
    const deviceSummary = new Map();
    let expected = 0;
    let present = 0;

    for (const record of records) {
      const subject = record[subjectField] || "unknown";
      const device = record[deviceField] || "unknown";
      ensureSummary(subjectSummary, subject);
      ensureSummary(deviceSummary, device);

      for (const viewItem of viewColumns) {
        expected += 1;
        subjectSummary.get(subject).expected += 1;
        deviceSummary.get(device).expected += 1;
        const path = record[viewItem.column];
        if (hasValue(path)) {
          present += 1;
          subjectSummary.get(subject).present += 1;
          deviceSummary.get(device).present += 1;
          if (seenPaths.has(path)) {
            duplicatePaths.push({
              path,
              first: seenPaths.get(path),
              duplicate: { subject, device, view: viewItem.view },
            });
          } else {
            seenPaths.set(path, { subject, device, view: viewItem.view });
          }
        } else {
          missing.push({ subject, device, view: viewItem.view, column: viewItem.column });
        }
      }
    }

    return {
      expected,
      present,
      missing,
      duplicatePaths,
      coverageRate: expected ? present / expected : 1,
      subjectSummary: summariesToArray(subjectSummary),
      deviceSummary: summariesToArray(deviceSummary),
    };
  }

  function ensureSummary(map, key) {
    if (!map.has(key)) map.set(key, { key, expected: 0, present: 0 });
  }

  function summariesToArray(map) {
    return [...map.values()].map(item => ({
      ...item,
      missing: item.expected - item.present,
      coverageRate: item.expected ? item.present / item.expected : 1,
    }));
  }

  function formatCoverageRate(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return `${(Number(value) * 100).toFixed(1)}%`;
  }

  return {
    auditPhotoCoverage,
    formatCoverageRate,
  };
});
