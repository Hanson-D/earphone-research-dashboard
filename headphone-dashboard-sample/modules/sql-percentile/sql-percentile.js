(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SqlPercentileModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[\s_\-—–/\\()[\]{}【】（）:：,，.。]+/g, "");
  }

  function nameTokens(value) {
    const normalized = String(value || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[\-—–/\\()[\]{}【】（）:：,，.。]+/g, "_");
    return normalized
      .split(/_|\s+/)
      .map(token => token.trim())
      .filter(token => token && !["mm", "cm", "deg", "degree", "value", "score", "raw"].includes(token));
  }

  function isNumericValue(value) {
    return value !== "" && value != null && Number.isFinite(Number(value));
  }

  function numericSubjectFields(subject = {}) {
    return Object.entries(subject)
      .filter(([, value]) => isNumericValue(value))
      .map(([field, value]) => ({ field, value: Number(value) }));
  }

  function scoreColumnMatch(dashboardField, dbColumn) {
    const fieldName = normalizeName(dashboardField);
    const columnName = normalizeName(dbColumn);
    if (!fieldName || !columnName) return { score: 0, reason: "empty" };
    if (fieldName === columnName) return { score: 1, reason: "exact" };
    if (fieldName.includes(columnName) || columnName.includes(fieldName)) {
      return { score: 0.88, reason: "contains" };
    }

    const fieldTokens = new Set(nameTokens(dashboardField));
    const columnTokens = new Set(nameTokens(dbColumn));
    const shared = [...fieldTokens].filter(token => columnTokens.has(token));
    const denominator = Math.max(fieldTokens.size, columnTokens.size, 1);
    const score = shared.length / denominator;
    return {
      score: Number(score.toFixed(3)),
      reason: shared.length ? `shared:${shared.join(",")}` : "none",
    };
  }

  function suggestMappings(subject = {}, columns = []) {
    const numericColumns = columns.filter(column => column.numeric);
    return numericSubjectFields(subject).map(item => {
      const candidates = numericColumns
        .map(column => ({ column, ...scoreColumnMatch(item.field, column.name) }))
        .filter(candidate => candidate.score >= 0.45)
        .sort((a, b) => b.score - a.score || a.column.name.localeCompare(b.column.name));
      const matched = candidates[0];
      return {
        dashboardField: item.field,
        value: item.value,
        dbColumn: matched?.column.name || "",
        confidence: matched?.score || 0,
        matchReason: matched?.reason || "unmatched",
        candidates: candidates.slice(0, 5).map(candidate => ({
          dbColumn: candidate.column.name,
          confidence: candidate.score,
          matchReason: candidate.reason,
        })),
      };
    });
  }

  function buildPercentileRequest({ databasePath = "", table = "", mappings = [], cohortFilters = [] } = {}) {
    return {
      databasePath,
      table,
      cohortFilters,
      mappings: mappings
        .filter(mapping => mapping.dbColumn && isNumericValue(mapping.value))
        .map(mapping => ({
          dashboardField: mapping.dashboardField,
          dbColumn: mapping.dbColumn,
          value: Number(mapping.value),
        })),
    };
  }

  function percentileLabel(percentile) {
    if (!Number.isFinite(Number(percentile))) return "—";
    return `P${Number(percentile).toFixed(1)}`;
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(digits);
  }

  function percentileBand(percentile) {
    const value = Number(percentile);
    if (!Number.isFinite(value)) return "unknown";
    if (value < 5) return "very-low";
    if (value < 25) return "low";
    if (value <= 75) return "middle";
    if (value <= 95) return "high";
    return "very-high";
  }

  function buildResultCards(results = []) {
    return results.map(result => ({
      title: result.dashboardField || result.dbColumn || "未命名字段",
      subtitle: result.dbColumn || "",
      percentileLabel: percentileLabel(result.percentile),
      band: percentileBand(result.percentile),
      metrics: [
        { label: "当前值", value: formatNumber(result.value) },
        { label: "样本量", value: result.sampleSize || 0 },
        { label: "均值", value: formatNumber(result.mean) },
        { label: "标准差", value: formatNumber(result.sd) },
        { label: "范围", value: `${formatNumber(result.min)}-${formatNumber(result.max)}` },
        { label: "Rank", value: result.rank || 0 },
      ],
    }));
  }

  function explainResult(result = {}) {
    const label = percentileLabel(result.percentile);
    const field = result.dashboardField || result.dbColumn || "该字段";
    const sampleSize = result.sampleSize || 0;
    const rank = result.rank || 0;
    const meanText = formatNumber(result.mean);
    const sdText = formatNumber(result.sd);
    return `${field} 为 ${formatNumber(result.value)}，在 ${sampleSize} 个参照样本中位于 ${label}（rank ${rank}）。参照样本均值 ${meanText}，标准差 ${sdText}。`;
  }

  function buildAnalysisPackage({
    subject = {},
    mappings = [],
    results = [],
    cohort = {},
    createdAt = new Date().toISOString(),
  } = {}) {
    return {
      createdAt,
      subject,
      cohort,
      mappings,
      results,
      cards: buildResultCards(results),
      explanations: results.map(explainResult),
      summary: {
        mappedFieldCount: mappings.filter(mapping => mapping.dbColumn).length,
        resultCount: results.length,
        cohortFiltered: results.some(result => result.cohortFiltered) || Boolean(cohort.filterCount),
      },
    };
  }

  function escapeCsvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function analysisPackageToCsv(analysisPackage = {}) {
    const rows = [["field", "dbColumn", "value", "percentile", "sampleSize", "mean", "sd", "rank", "explanation"]];
    const results = analysisPackage.results || [];
    const explanations = analysisPackage.explanations || results.map(explainResult);
    results.forEach((result, index) => {
      rows.push([
        result.dashboardField || "",
        result.dbColumn || "",
        formatNumber(result.value),
        Number.isFinite(Number(result.percentile)) ? Number(result.percentile).toFixed(1) : "",
        result.sampleSize || 0,
        formatNumber(result.mean),
        formatNumber(result.sd),
        result.rank || 0,
        explanations[index] || "",
      ]);
    });
    return rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
  }

  function serializeAnalysisPackage(analysisPackage = {}) {
    return JSON.stringify(analysisPackage, null, 2);
  }

  return {
    normalizeName,
    nameTokens,
    numericSubjectFields,
    scoreColumnMatch,
    suggestMappings,
    buildPercentileRequest,
    percentileLabel,
    formatNumber,
    percentileBand,
    buildResultCards,
    explainResult,
    buildAnalysisPackage,
    escapeCsvCell,
    analysisPackageToCsv,
    serializeAnalysisPackage,
  };
});
