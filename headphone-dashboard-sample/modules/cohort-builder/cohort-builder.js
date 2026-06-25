(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CohortBuilderModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const SUPPORTED_OPERATORS = new Set(["equals", "not_equals", "between", "in", "is_not_null"]);

  function normalizeFilter(filter = {}) {
    const operator = filter.operator || "equals";
    if (!filter.column || !SUPPORTED_OPERATORS.has(operator)) return null;
    if (operator === "is_not_null") return { column: filter.column, operator };
    if (operator === "between") {
      const value = Array.isArray(filter.value) ? filter.value.map(Number) : [];
      if (value.length !== 2 || value.some(item => !Number.isFinite(item))) return null;
      return { column: filter.column, operator, value: [Math.min(...value), Math.max(...value)] };
    }
    if (operator === "in") {
      const value = Array.isArray(filter.value) ? filter.value.filter(item => item !== "" && item != null) : [];
      return value.length ? { column: filter.column, operator, value } : null;
    }
    if (filter.value === "" || filter.value == null) return null;
    return { column: filter.column, operator, value: filter.value };
  }

  function normalizeFilters(filters = []) {
    return filters.map(normalizeFilter).filter(Boolean);
  }

  function deriveFiltersFromSubject(subject = {}, fields = []) {
    return fields
      .map(field => {
        const value = subject[field];
        if (value === "" || value == null) return null;
        return normalizeFilter({ column: field, operator: "equals", value });
      })
      .filter(Boolean);
  }

  function describeFilter(filter) {
    if (!filter) return "";
    if (filter.operator === "between") return `${filter.column}: ${filter.value[0]}-${filter.value[1]}`;
    if (filter.operator === "in") return `${filter.column}: ${filter.value.join(", ")}`;
    if (filter.operator === "is_not_null") return `${filter.column}: not null`;
    if (filter.operator === "not_equals") return `${filter.column}: not ${filter.value}`;
    return `${filter.column}: ${filter.value}`;
  }

  function buildCohortSummary(filters = [], sampleSize = null) {
    const normalized = normalizeFilters(filters);
    const label = normalized.length ? normalized.map(describeFilter).join("; ") : "all records";
    return {
      label,
      sampleSize,
      filterCount: normalized.length,
      filters: normalized,
    };
  }

  return {
    SUPPORTED_OPERATORS,
    normalizeFilter,
    normalizeFilters,
    deriveFiltersFromSubject,
    describeFilter,
    buildCohortSummary,
  };
});
