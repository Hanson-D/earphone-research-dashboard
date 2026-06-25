(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ModuleOrchestratorModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeStep(step = {}) {
    return {
      id: step.id || step.module || "unnamed-step",
      module: step.module || "",
      requires: Array.isArray(step.requires) ? step.requires : [],
      provides: Array.isArray(step.provides) ? step.provides : [],
    };
  }

  function normalizeWorkflow(steps = []) {
    return steps.map(normalizeStep);
  }

  function validateWorkflow(steps = [], initialContext = {}) {
    const normalized = normalizeWorkflow(steps);
    const available = new Set(Object.keys(initialContext || {}));
    const issues = [];
    for (const step of normalized) {
      const missing = step.requires.filter(key => !available.has(key));
      if (missing.length) {
        issues.push({ stepId: step.id, module: step.module, missing });
      }
      step.provides.forEach(key => available.add(key));
    }
    return {
      valid: issues.length === 0,
      issues,
      availableKeys: [...available],
      steps: normalized,
    };
  }

  function runWorkflow(steps = [], initialContext = {}, handlers = {}) {
    const normalized = normalizeWorkflow(steps);
    const context = { ...(initialContext || {}) };
    const log = [];
    for (const step of normalized) {
      const missing = step.requires.filter(key => !(key in context));
      if (missing.length) {
        throw new Error(`Step ${step.id} missing required keys: ${missing.join(", ")}`);
      }
      const handler = handlers[step.id] || handlers[step.module];
      if (typeof handler !== "function") {
        throw new Error(`Step ${step.id} has no handler`);
      }
      const output = handler(context, step) || {};
      Object.assign(context, output);
      log.push({ stepId: step.id, module: step.module, provided: Object.keys(output) });
    }
    return { context, log };
  }

  function buildDefaultSqlReportWorkflow() {
    return normalizeWorkflow([
      {
        id: "cohort",
        module: "cohort-builder",
        requires: ["selectedRecord"],
        provides: ["cohortFilters", "cohort"],
      },
      {
        id: "percentile",
        module: "sql-percentile",
        requires: ["selectedRecord", "cohortFilters", "databasePath", "table"],
        provides: ["percentileAnalysis"],
      },
      {
        id: "report",
        module: "report-export",
        requires: ["selectedRecord", "percentileAnalysis"],
        provides: ["reportModel"],
      },
    ]);
  }

  function workflowToMarkdown(steps = []) {
    return normalizeWorkflow(steps)
      .map((step, index) => `${index + 1}. ${step.id} (${step.module}): ${step.requires.join(", ") || "no inputs"} -> ${step.provides.join(", ") || "no outputs"}`)
      .join("\n");
  }

  return {
    normalizeStep,
    normalizeWorkflow,
    validateWorkflow,
    runWorkflow,
    buildDefaultSqlReportWorkflow,
    workflowToMarkdown,
  };
});
