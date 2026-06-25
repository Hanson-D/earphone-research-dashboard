(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BaseAppBridgeModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const TARGETS = {
    html: "headphone-dashboard-sample/index.html",
    app: "headphone-dashboard-sample/app.js",
    server: "headphone-dashboard-sample/server.py",
  };

  function buildPatchPlan(integrationPlan = {}) {
    return {
      modules: integrationPlan.modules || [],
      patches: [
        ...buildHtmlPatches(integrationPlan.pageEntries || [], integrationPlan.staticFiles || []),
        ...buildAppPatches(integrationPlan.pageEntries || [], integrationPlan.staticFiles || []),
        ...buildServerPatches(integrationPlan.apiRoutes || []),
      ],
      validationCommands: integrationPlan.testCommands || [],
    };
  }

  function buildHtmlPatches(pageEntries = [], staticFiles = []) {
    const patches = [];
    for (const entry of pageEntries) {
      patches.push({
        target: TARGETS.html,
        type: "insert-page-entry",
        anchor: "navigation/page switcher",
        summary: `Add page entry ${entry.label || entry.id}`,
        payload: entry,
      });
      if (entry.fragment) {
        patches.push({
          target: TARGETS.html,
          type: "insert-page-fragment",
          anchor: "main app pages container",
          summary: `Load page fragment ${entry.fragment}`,
          payload: { fragment: entry.fragment },
        });
      }
    }
    const cssFiles = staticFiles.filter(file => file.endsWith(".css"));
    for (const file of cssFiles) {
      patches.push({
        target: TARGETS.html,
        type: "add-stylesheet",
        anchor: "head styles",
        summary: `Add stylesheet ${file}`,
        payload: { href: file },
      });
    }
    return patches;
  }

  function buildAppPatches(pageEntries = [], staticFiles = []) {
    const scriptFiles = staticFiles.filter(file => file.endsWith(".js"));
    return [
      ...scriptFiles.map(file => ({
        target: TARGETS.html,
        type: "add-script",
        anchor: "module scripts",
        summary: `Add script ${file}`,
        payload: { src: file },
      })),
      ...pageEntries.map(entry => ({
        target: TARGETS.app,
        type: "register-page-controller",
        anchor: "page initialization",
        summary: `Register controller for ${entry.id}`,
        payload: { pageId: entry.id },
      })),
    ];
  }

  function buildServerPatches(apiRoutes = []) {
    return apiRoutes.map(route => ({
      target: TARGETS.server,
      type: "mount-api-route",
      anchor: "request routing",
      summary: `Mount ${route.method} ${route.path}`,
      payload: route,
    }));
  }

  function validatePatchPlan(plan = {}) {
    const missingTargets = (plan.patches || [])
      .filter(patch => !patch.target || !patch.type)
      .map(patch => patch.summary || "unknown patch");
    const routePatches = (plan.patches || []).filter(patch => patch.type === "mount-api-route");
    const routeIssues = routePatches
      .filter(patch => !patch.payload?.method || !patch.payload?.path || !patch.payload?.handler)
      .map(patch => patch.summary);
    return {
      valid: missingTargets.length === 0 && routeIssues.length === 0,
      missingTargets,
      routeIssues,
      patchCount: (plan.patches || []).length,
    };
  }

  function patchPlanToMarkdown(plan = {}) {
    const validation = validatePatchPlan(plan);
    const rows = (plan.patches || [])
      .map(patch => `- ${patch.target}: ${patch.type} at ${patch.anchor} — ${patch.summary}`)
      .join("\n");
    const tests = (plan.validationCommands || [])
      .map(command => `- \`${command}\``)
      .join("\n");
    return `# Base App Bridge Plan

Valid: ${validation.valid ? "yes" : "no"}
Patch count: ${validation.patchCount}

## Patches

${rows || "- none"}

## Validation

${tests || "- none"}
`;
  }

  return {
    TARGETS,
    buildPatchPlan,
    buildHtmlPatches,
    buildAppPatches,
    buildServerPatches,
    validatePatchPlan,
    patchPlanToMarkdown,
  };
});
