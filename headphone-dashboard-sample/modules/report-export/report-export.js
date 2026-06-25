(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ReportExportModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function percentileBand(percentile) {
    const value = Number(percentile);
    if (!Number.isFinite(value)) return "unknown";
    if (value < 5) return "very_low";
    if (value < 25) return "low";
    if (value <= 75) return "middle";
    if (value <= 95) return "high";
    return "very_high";
  }

  function buildReportModel({
    title = "Earphone Research Report",
    createdAt = new Date().toISOString(),
    subject = {},
    cohort = {},
    percentiles = [],
    notes = [],
  } = {}) {
    return {
      title,
      createdAt,
      subject,
      cohort,
      percentiles: percentiles.map(item => ({
        field: item.dashboardField || item.field || "",
        dbColumn: item.dbColumn || "",
        value: Number.isFinite(Number(item.value)) ? Number(item.value) : item.value,
        percentile: Number.isFinite(Number(item.percentile)) ? Number(item.percentile) : null,
        sampleSize: item.sampleSize || 0,
        band: percentileBand(item.percentile),
      })),
      notes: Array.isArray(notes) ? notes.filter(Boolean) : [],
    };
  }

  function escapeCsvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function reportToCsv(model) {
    const rows = [["field", "dbColumn", "value", "percentile", "sampleSize", "band"]];
    for (const item of model.percentiles || []) {
      rows.push([
        item.field,
        item.dbColumn,
        item.value,
        item.percentile == null ? "" : item.percentile.toFixed(1),
        item.sampleSize,
        item.band,
      ]);
    }
    return rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function reportToHtml(model) {
    const rows = (model.percentiles || []).map(item => `
      <tr>
        <td>${escapeHtml(item.field)}</td>
        <td>${escapeHtml(item.dbColumn)}</td>
        <td>${escapeHtml(item.value)}</td>
        <td>${item.percentile == null ? "" : escapeHtml(item.percentile.toFixed(1))}</td>
        <td>${escapeHtml(item.sampleSize)}</td>
        <td>${escapeHtml(item.band)}</td>
      </tr>
    `).join("");
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(model.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #211a18; }
    h1 { color: #8c0000; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
    .meta { color: #706864; }
  </style>
</head>
<body>
  <h1>${escapeHtml(model.title)}</h1>
  <p class="meta">Created at: ${escapeHtml(model.createdAt)}</p>
  <p class="meta">Cohort: ${escapeHtml(model.cohort?.label || "all records")}</p>
  <table>
    <thead><tr><th>Field</th><th>DB Column</th><th>Value</th><th>Percentile</th><th>N</th><th>Band</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }

  return {
    percentileBand,
    buildReportModel,
    reportToCsv,
    reportToHtml,
    escapeCsvCell,
    escapeHtml,
  };
});
