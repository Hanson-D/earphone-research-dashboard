(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.StudyAuditLogModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function slugPart(value) {
    return String(value || "unknown")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  function createRunId({ projectId, module, subjectId, createdAt } = {}) {
    const timestamp = String(createdAt || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 14);
    return [slugPart(projectId), slugPart(module), slugPart(subjectId), timestamp].join("__");
  }

  function summarizeOutput(output = {}) {
    return {
      resultCount: output.resultCount ?? output.results?.length ?? 0,
      warningCount: output.warningCount ?? output.warnings?.length ?? 0,
      artifactCount: output.artifacts?.length ?? 0,
    };
  }

  function createAuditEntry({
    projectId = "",
    module = "",
    subjectId = "",
    selectedRecord = null,
    cohort = null,
    output = {},
    artifacts = [],
    createdAt = new Date().toISOString(),
    id = null,
  } = {}) {
    const warnings = output.warnings || [];
    return {
      id: id || createRunId({ projectId, module, subjectId, createdAt }),
      projectId,
      module,
      subjectId,
      createdAt,
      selectedRecord,
      cohort,
      summary: summarizeOutput({ ...output, artifacts }),
      warnings,
      artifacts,
    };
  }

  function appendAuditEntry(log = [], entry) {
    if (!entry || !entry.id) throw new Error("audit entry requires id");
    return [...log.filter(item => item.id !== entry.id), entry]
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  }

  function queryAuditLog(log = [], {
    projectId = null,
    module = null,
    subjectId = null,
    hasWarnings = null,
  } = {}) {
    return log.filter(entry => {
      if (projectId && entry.projectId !== projectId) return false;
      if (module && entry.module !== module) return false;
      if (subjectId && entry.subjectId !== subjectId) return false;
      if (hasWarnings === true && !(entry.warnings || []).length) return false;
      if (hasWarnings === false && (entry.warnings || []).length) return false;
      return true;
    });
  }

  function escapeCsvCell(value) {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function auditLogToCsv(log = []) {
    const rows = [["id", "projectId", "module", "subjectId", "createdAt", "resultCount", "warningCount", "artifactCount"]];
    for (const entry of log) {
      rows.push([
        entry.id,
        entry.projectId,
        entry.module,
        entry.subjectId,
        entry.createdAt,
        entry.summary?.resultCount || 0,
        entry.summary?.warningCount || 0,
        entry.summary?.artifactCount || 0,
      ]);
    }
    return rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
  }

  function auditLogToJson(log = []) {
    return JSON.stringify(log, null, 2);
  }

  function summarizeAuditLog(log = []) {
    const warningRuns = queryAuditLog(log, { hasWarnings: true }).length;
    const modules = [...new Set(log.map(entry => entry.module).filter(Boolean))].sort();
    return {
      runCount: log.length,
      warningRuns,
      modules,
      latestRunAt: log[0]?.createdAt || null,
    };
  }

  return {
    slugPart,
    createRunId,
    summarizeOutput,
    createAuditEntry,
    appendAuditEntry,
    queryAuditLog,
    escapeCsvCell,
    auditLogToCsv,
    auditLogToJson,
    summarizeAuditLog,
  };
});
