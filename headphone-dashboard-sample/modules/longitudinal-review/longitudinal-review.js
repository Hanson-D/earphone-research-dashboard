(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LongitudinalReviewModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function numericValue(value) {
    const number = Number(value);
    return value !== "" && value != null && Number.isFinite(number) ? number : null;
  }

  function groupRecords(records = [], subjectField = "name") {
    const groups = new Map();
    for (const record of records) {
      const subject = record[subjectField] || "unknown";
      if (!groups.has(subject)) groups.set(subject, []);
      groups.get(subject).push(record);
    }
    return [...groups.entries()].map(([subject, rows]) => ({ subject, rows }));
  }

  function bestCondition(rows = [], conditionField = "device", metricField) {
    const scored = rows
      .map(row => ({
        condition: row[conditionField] || "unknown",
        value: numericValue(row[metricField]),
        record: row,
      }))
      .filter(item => item.value != null)
      .sort((a, b) => b.value - a.value || a.condition.localeCompare(b.condition));
    return scored[0] || null;
  }

  function pairwiseDeltas(rows = [], conditionField = "device", metricFields = []) {
    const deltas = [];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const from = rows[i];
        const to = rows[j];
        for (const metric of metricFields) {
          const fromValue = numericValue(from[metric]);
          const toValue = numericValue(to[metric]);
          if (fromValue == null || toValue == null) continue;
          deltas.push({
            metric,
            fromCondition: from[conditionField] || "unknown",
            toCondition: to[conditionField] || "unknown",
            fromValue,
            toValue,
            delta: Number((toValue - fromValue).toFixed(6)),
          });
        }
      }
    }
    return deltas;
  }

  function summarizeSubject(rows = [], {
    conditionField = "device",
    metricFields = [],
  } = {}) {
    const bestByMetric = {};
    for (const metric of metricFields) {
      const best = bestCondition(rows, conditionField, metric);
      bestByMetric[metric] = best ? {
        condition: best.condition,
        value: best.value,
      } : null;
    }
    return {
      recordCount: rows.length,
      conditions: [...new Set(rows.map(row => row[conditionField] || "unknown"))],
      bestByMetric,
      deltas: pairwiseDeltas(rows, conditionField, metricFields),
    };
  }

  function buildLongitudinalReview(records = [], {
    subjectField = "name",
    conditionField = "device",
    metricFields = [],
  } = {}) {
    return groupRecords(records, subjectField).map(group => ({
      subject: group.subject,
      ...summarizeSubject(group.rows, { conditionField, metricFields }),
    }));
  }

  return {
    numericValue,
    groupRecords,
    bestCondition,
    pairwiseDeltas,
    summarizeSubject,
    buildLongitudinalReview,
  };
});
