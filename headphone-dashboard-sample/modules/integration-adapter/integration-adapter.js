(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.IntegrationAdapterModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const INTEGRATION_REGISTRY = {
    "sql-percentile": {
      staticFiles: [
        "modules/sql-percentile/sql-percentile.js",
        "modules/sql-percentile/sql-percentile.css",
        "modules/sql-percentile/sql-percentile-page.html",
      ],
      apiRoutes: [
        { method: "GET", path: "/api/sqlite-schema", handler: "sql_percentile_api.schema_response" },
        { method: "POST", path: "/api/sqlite-percentiles", handler: "sql_percentile_api.percentile_response" },
      ],
      pageEntries: [
        { id: "sql-percentile", label: "03 SQL Percentile", fragment: "modules/sql-percentile/sql-percentile-page.html" },
      ],
      testCommands: [
        "node --test modules/sql-percentile/sql-percentile.test.js",
        "python3 modules/sql-percentile/sql_percentile_api_test.py",
      ],
    },
    "cohort-builder": {
      staticFiles: ["modules/cohort-builder/cohort-builder.js"],
      apiRoutes: [],
      pageEntries: [],
      testCommands: ["node --test modules/cohort-builder/cohort-builder.test.js"],
    },
    "report-export": {
      staticFiles: ["modules/report-export/report-export.js"],
      apiRoutes: [],
      pageEntries: [],
      testCommands: ["node --test modules/report-export/report-export.test.js"],
    },
    "module-orchestrator": {
      staticFiles: ["modules/module-orchestrator/module-orchestrator.js"],
      apiRoutes: [],
      pageEntries: [],
      testCommands: ["node --test modules/module-orchestrator/module-orchestrator.test.js"],
    },
    "study-audit-log": {
      staticFiles: ["modules/study-audit-log/study-audit-log.js"],
      apiRoutes: [],
      pageEntries: [],
      testCommands: ["node --test modules/study-audit-log/study-audit-log.test.js"],
    },
  };

  function uniqueBy(items = [], keyFn = item => item) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  function buildIntegrationPlan(modules = []) {
    const selected = uniqueBy(modules.filter(Boolean));
    const details = selected.map(name => ({
      name,
      available: Boolean(INTEGRATION_REGISTRY[name]),
      ...(INTEGRATION_REGISTRY[name] || {}),
    }));
    return {
      modules: selected,
      details,
      staticFiles: uniqueBy(details.flatMap(detail => detail.staticFiles || [])),
      apiRoutes: uniqueBy(details.flatMap(detail => detail.apiRoutes || []), route => `${route.method} ${route.path}`),
      pageEntries: uniqueBy(details.flatMap(detail => detail.pageEntries || []), entry => entry.id),
      testCommands: uniqueBy(details.flatMap(detail => detail.testCommands || [])),
    };
  }

  function validateIntegrationPlan(plan = {}) {
    const missingModules = (plan.details || [])
      .filter(detail => !detail.available)
      .map(detail => detail.name);
    const duplicateRoutes = findDuplicates((plan.apiRoutes || []).map(route => `${route.method} ${route.path}`));
    const duplicatePages = findDuplicates((plan.pageEntries || []).map(entry => entry.id));
    return {
      valid: missingModules.length === 0 && duplicateRoutes.length === 0 && duplicatePages.length === 0,
      missingModules,
      duplicateRoutes,
      duplicatePages,
    };
  }

  function findDuplicates(values = []) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return [...duplicates];
  }

  function planToChecklist(plan = {}) {
    const staticRows = (plan.staticFiles || []).map(file => `- Serve static file: ${file}`);
    const routeRows = (plan.apiRoutes || []).map(route => `- Mount API: ${route.method} ${route.path} -> ${route.handler}`);
    const pageRows = (plan.pageEntries || []).map(entry => `- Add page entry: ${entry.label} (${entry.id})`);
    const testRows = (plan.testCommands || []).map(command => `- Run: ${command}`);
    return [...staticRows, ...routeRows, ...pageRows, ...testRows].join("\n");
  }

  return {
    INTEGRATION_REGISTRY,
    uniqueBy,
    buildIntegrationPlan,
    validateIntegrationPlan,
    findDuplicates,
    planToChecklist,
  };
});
