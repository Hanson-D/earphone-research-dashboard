(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.StudyDashboardPackagerModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const MODULE_REGISTRY = {
    "sql-percentile": {
      label: "03 SQL percentile",
      entryFiles: [
        "sql-percentile/sql-percentile.js",
        "sql-percentile/sql-percentile-page.html",
        "sql-percentile/sql-percentile.css",
        "sql-percentile/sql_percentile.py",
        "sql-percentile/sql_percentile_api.py",
        "sql-percentile/sql_percentile_cli.py",
      ],
      testCommands: [
        "node --test modules/sql-percentile/sql-percentile.test.js",
        "python3 modules/sql-percentile/sql_percentile_test.py",
        "python3 modules/sql-percentile/sql_percentile_api_test.py",
        "python3 modules/sql-percentile/sql_percentile_cli_test.py",
      ],
    },
    "cohort-builder": {
      label: "04 cohort builder",
      entryFiles: ["cohort-builder/cohort-builder.js", "cohort-builder/cohort_builder.py"],
      testCommands: [
        "node --test modules/cohort-builder/cohort-builder.test.js",
        "python3 modules/cohort-builder/cohort_builder_test.py",
      ],
    },
    "report-export": {
      label: "05 report export",
      entryFiles: ["report-export/report-export.js"],
      testCommands: ["node --test modules/report-export/report-export.test.js"],
    },
    "photo-quality-audit": {
      label: "06 photo quality audit",
      entryFiles: ["photo-quality-audit/photo-quality-audit.js"],
      testCommands: ["node --test modules/photo-quality-audit/photo-quality-audit.test.js"],
    },
    "protocol-template": {
      label: "07 protocol template",
      entryFiles: ["protocol-template/protocol-template.js"],
      testCommands: ["node --test modules/protocol-template/protocol-template.test.js"],
    },
    "longitudinal-review": {
      label: "08 longitudinal review",
      entryFiles: ["longitudinal-review/longitudinal-review.js"],
      testCommands: ["node --test modules/longitudinal-review/longitudinal-review.test.js"],
    },
    "device-effect-model": {
      label: "09 device effect model",
      entryFiles: ["device-effect-model/device-effect-model.js"],
      testCommands: ["node --test modules/device-effect-model/device-effect-model.test.js"],
    },
    "annotation-review": {
      label: "10 annotation review",
      entryFiles: ["annotation-review/annotation-review.js"],
      testCommands: ["node --test modules/annotation-review/annotation-review.test.js"],
    },
    "module-orchestrator": {
      label: "12 module orchestrator",
      entryFiles: ["module-orchestrator/module-orchestrator.js"],
      testCommands: ["node --test modules/module-orchestrator/module-orchestrator.test.js"],
    },
    "local-project-registry": {
      label: "13 local project registry",
      entryFiles: ["local-project-registry/local-project-registry.js"],
      testCommands: ["node --test modules/local-project-registry/local-project-registry.test.js"],
    },
    "study-audit-log": {
      label: "14 study audit log",
      entryFiles: ["study-audit-log/study-audit-log.js"],
      testCommands: ["node --test modules/study-audit-log/study-audit-log.test.js"],
    },
    "integration-adapter": {
      label: "15 integration adapter",
      entryFiles: ["integration-adapter/integration-adapter.js"],
      testCommands: ["node --test modules/integration-adapter/integration-adapter.test.js"],
    },
    "visual-grammar": {
      label: "16 visual grammar",
      entryFiles: ["visual-grammar/visual-grammar.js"],
      testCommands: ["node --test modules/visual-grammar/visual-grammar.test.js"],
    },
    "module-health-dashboard": {
      label: "17 module health dashboard",
      entryFiles: ["module-health-dashboard/module-health-dashboard.js"],
      testCommands: ["node --test modules/module-health-dashboard/module-health-dashboard.test.js"],
    },
    "base-app-bridge": {
      label: "18 base app bridge",
      entryFiles: ["base-app-bridge/base-app-bridge.js"],
      testCommands: ["node --test modules/base-app-bridge/base-app-bridge.test.js"],
    },
    "persistence-adapter": {
      label: "19 persistence adapter",
      entryFiles: ["persistence-adapter/persistence-adapter.js"],
      testCommands: ["node --test modules/persistence-adapter/persistence-adapter.test.js"],
    },
  };

  function unique(values = []) {
    return [...new Set(values.filter(Boolean))];
  }

  function buildManifest({
    studyName = "Untitled Study",
    modules = [],
    resources = [],
    entryPoints = [],
    createdAt = new Date().toISOString(),
  } = {}) {
    const selectedModules = unique(modules);
    const moduleDetails = selectedModules.map(name => ({
      name,
      available: Boolean(MODULE_REGISTRY[name]),
      ...(MODULE_REGISTRY[name] || {}),
    }));
    return {
      studyName,
      createdAt,
      modules: selectedModules,
      moduleDetails,
      resources,
      entryPoints: unique(entryPoints),
      testCommands: unique(moduleDetails.flatMap(module => module.testCommands || [])),
      files: unique(moduleDetails.flatMap(module => module.entryFiles || [])),
    };
  }

  function validateManifest(manifest = {}) {
    const missingModules = (manifest.moduleDetails || [])
      .filter(module => !module.available)
      .map(module => module.name);
    const missingResourcePaths = (manifest.resources || [])
      .filter(resource => !resource.path)
      .map(resource => resource.type || "unknown");
    const missingEntryPoints = (manifest.entryPoints || []).length ? [] : ["entryPoints"];
    return {
      valid: missingModules.length === 0 && missingResourcePaths.length === 0 && missingEntryPoints.length === 0,
      missingModules,
      missingResourcePaths,
      missingEntryPoints,
    };
  }

  function manifestToMarkdown(manifest = {}) {
    const validation = validateManifest(manifest);
    const moduleRows = (manifest.moduleDetails || [])
      .map(module => `- ${module.name}: ${module.available ? module.label : "missing"}`)
      .join("\n");
    const resourceRows = (manifest.resources || [])
      .map(resource => `- ${resource.type || "resource"}: ${resource.path || "(missing path)"}`)
      .join("\n");
    const testRows = (manifest.testCommands || [])
      .map(command => `- \`${command}\``)
      .join("\n");
    return `# ${manifest.studyName || "Untitled Study"} Package

Created: ${manifest.createdAt || ""}

Valid: ${validation.valid ? "yes" : "no"}

## Modules

${moduleRows || "- none"}

## Resources

${resourceRows || "- none"}

## Test Commands

${testRows || "- none"}
`;
  }

  return {
    MODULE_REGISTRY,
    buildManifest,
    validateManifest,
    manifestToMarkdown,
    unique,
  };
});
