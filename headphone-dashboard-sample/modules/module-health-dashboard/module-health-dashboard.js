(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ModuleHealthDashboardModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeRegistry(registry = {}) {
    return Object.entries(registry).map(([name, item]) => ({
      name,
      label: item.label || name,
      fileCount: (item.entryFiles || []).length,
      testCount: (item.testCommands || []).length,
      entryFiles: item.entryFiles || [],
      testCommands: item.testCommands || [],
    }));
  }

  function buildHealthRows(registry = {}, testResults = {}) {
    return normalizeRegistry(registry).map(module => {
      const result = testResults[module.name] || {};
      const status = result.status || (module.testCount ? "not-run" : "missing-tests");
      const issues = [];
      if (!module.fileCount) issues.push("missing-entry-files");
      if (!module.testCount) issues.push("missing-tests");
      if (status === "fail") issues.push("tests-failed");
      return {
        ...module,
        status,
        passCount: result.passCount || 0,
        failCount: result.failCount || 0,
        durationMs: result.durationMs || null,
        issues,
        ready: issues.length === 0 && (status === "pass" || status === "not-run"),
      };
    });
  }

  function summarizeHealth(rows = []) {
    const total = rows.length;
    const ready = rows.filter(row => row.ready).length;
    const failed = rows.filter(row => row.status === "fail").length;
    const missingTests = rows.filter(row => row.issues.includes("missing-tests")).length;
    return {
      total,
      ready,
      failed,
      missingTests,
      readinessScore: total ? Number((ready / total).toFixed(3)) : 1,
    };
  }

  function buildHealthDashboard(registry = {}, testResults = {}) {
    const rows = buildHealthRows(registry, testResults);
    return {
      summary: summarizeHealth(rows),
      rows,
      issues: rows.flatMap(row => row.issues.map(issue => ({ module: row.name, issue }))),
    };
  }

  function healthToMarkdown(dashboard = {}) {
    const summary = dashboard.summary || summarizeHealth(dashboard.rows || []);
    const rows = (dashboard.rows || [])
      .map(row => `- ${row.name}: ${row.status}, files=${row.fileCount}, tests=${row.testCount}, ready=${row.ready ? "yes" : "no"}`)
      .join("\n");
    const issues = (dashboard.issues || [])
      .map(issue => `- ${issue.module}: ${issue.issue}`)
      .join("\n");
    return `# Module Health

Readiness: ${summary.ready}/${summary.total} (${summary.readinessScore})
Failed: ${summary.failed}
Missing tests: ${summary.missingTests}

## Modules

${rows || "- none"}

## Issues

${issues || "- none"}
`;
  }

  return {
    normalizeRegistry,
    buildHealthRows,
    summarizeHealth,
    buildHealthDashboard,
    healthToMarkdown,
  };
});
