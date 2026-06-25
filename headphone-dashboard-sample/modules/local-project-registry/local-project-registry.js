(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LocalProjectRegistryModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function slugify(value) {
    return String(value || "untitled-project")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled-project";
  }

  function createProjectEntry({
    id,
    name,
    projectPath = "",
    manifestPath = "",
    createdAt = new Date().toISOString(),
    lastOpenedAt = null,
    tags = [],
  } = {}) {
    const projectName = name || id || "Untitled Project";
    return {
      id: id || slugify(projectName),
      name: projectName,
      projectPath,
      manifestPath,
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: lastOpenedAt || createdAt,
      tags: Array.isArray(tags) ? [...new Set(tags.filter(Boolean))] : [],
    };
  }

  function upsertProject(registry = [], project, now = new Date().toISOString()) {
    const entry = {
      ...createProjectEntry(project),
      updatedAt: now,
    };
    const index = registry.findIndex(item => item.id === entry.id);
    if (index === -1) return [...registry, entry];
    return registry.map((item, itemIndex) => itemIndex === index ? { ...item, ...entry } : item);
  }

  function markProjectOpened(registry = [], projectId, openedAt = new Date().toISOString()) {
    return registry.map(project => project.id === projectId
      ? { ...project, lastOpenedAt: openedAt, updatedAt: openedAt }
      : project);
  }

  function sortByRecent(registry = []) {
    return [...registry].sort((a, b) => {
      const timeDelta = Date.parse(b.lastOpenedAt || 0) - Date.parse(a.lastOpenedAt || 0);
      return timeDelta || a.name.localeCompare(b.name);
    });
  }

  function validateProjectEntry(project = {}) {
    const issues = [];
    if (!project.id) issues.push("id");
    if (!project.name) issues.push("name");
    if (!project.projectPath) issues.push("projectPath");
    if (!project.manifestPath) issues.push("manifestPath");
    return {
      valid: issues.length === 0,
      missingFields: issues,
    };
  }

  function buildProjectPickerModel(registry = []) {
    return sortByRecent(registry).map(project => ({
      id: project.id,
      label: project.name,
      subtitle: project.projectPath,
      lastOpenedAt: project.lastOpenedAt,
      tags: project.tags || [],
      valid: validateProjectEntry(project).valid,
    }));
  }

  function serializeRegistry(registry = []) {
    return JSON.stringify(sortByRecent(registry), null, 2);
  }

  return {
    slugify,
    createProjectEntry,
    upsertProject,
    markProjectOpened,
    sortByRecent,
    validateProjectEntry,
    buildProjectPickerModel,
    serializeRegistry,
  };
});
