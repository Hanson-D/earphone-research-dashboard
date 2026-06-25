(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VisualGrammarModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const STATUS_TONES = {
    success: { label: "正常", tone: "success" },
    warning: { label: "需复核", tone: "warning" },
    error: { label: "错误", tone: "error" },
    info: { label: "信息", tone: "info" },
    muted: { label: "未运行", tone: "muted" },
  };

  function statusBadge(status = "muted", label = null) {
    const base = STATUS_TONES[status] || STATUS_TONES.muted;
    return {
      status,
      label: label || base.label,
      tone: base.tone,
    };
  }

  function percentileBand(percentile) {
    const value = Number(percentile);
    if (!Number.isFinite(value)) return { band: "unknown", label: "未知", tone: "muted" };
    if (value < 5) return { band: "very-low", label: "极低", tone: "low-critical" };
    if (value < 25) return { band: "low", label: "偏低", tone: "low" };
    if (value <= 75) return { band: "middle", label: "中间", tone: "neutral" };
    if (value <= 95) return { band: "high", label: "偏高", tone: "high" };
    return { band: "very-high", label: "极高", tone: "high-critical" };
  }

  function buildTableModel(rows = [], columns = []) {
    const normalizedColumns = columns.map(column => ({
      key: column.key,
      label: column.label || column.key,
      align: column.align || (column.numeric ? "right" : "left"),
      numeric: Boolean(column.numeric),
    }));
    return {
      columns: normalizedColumns,
      rows: rows.map(row => ({
        id: row.id || normalizedColumns.map(column => row[column.key]).join("|"),
        cells: normalizedColumns.map(column => ({
          key: column.key,
          value: row[column.key],
          align: column.align,
        })),
      })),
    };
  }

  function buildBarChartModel(rows = [], {
    labelKey = "label",
    valueKey = "value",
    seriesLabel = "Value",
    domain = null,
  } = {}) {
    const values = rows
      .map(row => Number(row[valueKey]))
      .filter(value => Number.isFinite(value));
    const computedMin = values.length ? Math.min(0, ...values) : 0;
    const computedMax = values.length ? Math.max(...values) : 0;
    const [min, max] = domain || [computedMin, computedMax];
    const span = max - min || 1;
    return {
      seriesLabel,
      domain: { min, max },
      bars: rows.map(row => {
        const value = Number(row[valueKey]);
        return {
          label: row[labelKey],
          value: Number.isFinite(value) ? value : null,
          widthRatio: Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / span)) : 0,
          raw: row,
        };
      }),
    };
  }

  function buildLegend(items = []) {
    return items.map(item => ({
      key: item.key || item.label,
      label: item.label || item.key,
      tone: item.tone || "neutral",
    }));
  }

  function formatMetric(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(digits);
  }

  return {
    STATUS_TONES,
    statusBadge,
    percentileBand,
    buildTableModel,
    buildBarChartModel,
    buildLegend,
    formatMetric,
  };
});
