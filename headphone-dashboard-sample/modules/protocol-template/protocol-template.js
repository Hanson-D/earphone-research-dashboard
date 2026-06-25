(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ProtocolTemplateModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function getColumns(records = []) {
    const columns = new Set();
    for (const record of records) {
      Object.keys(record || {}).forEach(column => columns.add(column));
    }
    return [...columns].sort();
  }

  function isNumeric(value) {
    return value !== "" && value != null && Number.isFinite(Number(value));
  }

  function validateProtocol(records = [], template = {}) {
    const columns = getColumns(records);
    const columnSet = new Set(columns);
    const missingRequiredFields = (template.requiredFields || []).filter(field => !columnSet.has(field));
    const missingRecommendedFields = (template.recommendedFields || []).filter(field => !columnSet.has(field));
    const rangeIssues = [];

    for (const [field, range] of Object.entries(template.numericRanges || {})) {
      if (!Array.isArray(range) || range.length !== 2 || !columnSet.has(field)) continue;
      const [min, max] = [Math.min(...range), Math.max(...range)];
      records.forEach((record, rowIndex) => {
        const rawValue = record[field];
        if (rawValue === "" || rawValue == null) return;
        if (!isNumeric(rawValue)) {
          rangeIssues.push({ rowIndex, field, value: rawValue, message: "not_numeric" });
          return;
        }
        const value = Number(rawValue);
        if (value < min || value > max) {
          rangeIssues.push({ rowIndex, field, value, min, max, message: "out_of_range" });
        }
      });
    }

    return {
      templateName: template.name || "Untitled Protocol",
      rowCount: records.length,
      columns,
      missingRequiredFields,
      missingRecommendedFields,
      rangeIssues,
      valid: missingRequiredFields.length === 0 && rangeIssues.length === 0,
    };
  }

  function buildPhotoViewColumns(photoViews = [], suffix = "_photo") {
    return photoViews.map(view => ({ view, column: `${view}${suffix}` }));
  }

  function summarizeValidation(validation) {
    if (validation.valid) return `${validation.templateName}: valid (${validation.rowCount} rows)`;
    const parts = [];
    if (validation.missingRequiredFields.length) {
      parts.push(`missing required: ${validation.missingRequiredFields.join(", ")}`);
    }
    if (validation.rangeIssues.length) {
      parts.push(`range issues: ${validation.rangeIssues.length}`);
    }
    return `${validation.templateName}: ${parts.join("; ")}`;
  }

  return {
    getColumns,
    validateProtocol,
    buildPhotoViewColumns,
    summarizeValidation,
  };
});
