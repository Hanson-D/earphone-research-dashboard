const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./local-project-registry");

test("createProjectEntry creates stable ids and unique tags", () => {
  const entry = moduleApi.createProjectEntry({
    name: "Headphone Fit 2026",
    createdAt: "2026-06-25T00:00:00.000Z",
    tags: ["earphone", "earphone", "pilot"]
  });
  assert.equal(entry.id, "headphone-fit-2026");
  assert.deepEqual(entry.tags, ["earphone", "pilot"]);
  assert.equal(entry.lastOpenedAt, "2026-06-25T00:00:00.000Z");
});

test("upsertProject inserts and updates existing projects", () => {
  let registry = moduleApi.upsertProject([], {
    id: "study-a",
    name: "Study A",
    projectPath: "D:/A",
    manifestPath: "D:/A/manifest.json"
  }, "2026-06-25T00:00:00.000Z");
  registry = moduleApi.upsertProject(registry, {
    id: "study-a",
    name: "Study A Updated",
    projectPath: "D:/A2",
    manifestPath: "D:/A2/manifest.json"
  }, "2026-06-26T00:00:00.000Z");
  assert.equal(registry.length, 1);
  assert.equal(registry[0].name, "Study A Updated");
  assert.equal(registry[0].updatedAt, "2026-06-26T00:00:00.000Z");
});

test("markProjectOpened and sortByRecent prioritize recent projects", () => {
  const registry = [
    moduleApi.createProjectEntry({ id: "a", name: "A", createdAt: "2026-06-24T00:00:00.000Z" }),
    moduleApi.createProjectEntry({ id: "b", name: "B", createdAt: "2026-06-23T00:00:00.000Z" })
  ];
  const updated = moduleApi.markProjectOpened(registry, "b", "2026-06-25T00:00:00.000Z");
  assert.deepEqual(moduleApi.sortByRecent(updated).map(item => item.id), ["b", "a"]);
});

test("validateProjectEntry and buildProjectPickerModel expose validity", () => {
  const registry = [
    moduleApi.createProjectEntry({
      id: "valid",
      name: "Valid",
      projectPath: "D:/valid",
      manifestPath: "D:/valid/manifest.json"
    }),
    moduleApi.createProjectEntry({ id: "invalid", name: "Invalid" })
  ];
  assert.deepEqual(moduleApi.validateProjectEntry(registry[1]).missingFields, ["projectPath", "manifestPath"]);
  const picker = moduleApi.buildProjectPickerModel(registry);
  assert.equal(picker.find(item => item.id === "valid").valid, true);
  assert.equal(picker.find(item => item.id === "invalid").valid, false);
});

test("serializeRegistry outputs recent-first JSON", () => {
  const registry = [
    moduleApi.createProjectEntry({ id: "a", name: "A", createdAt: "2026-06-24T00:00:00.000Z" }),
    moduleApi.createProjectEntry({ id: "b", name: "B", createdAt: "2026-06-25T00:00:00.000Z" })
  ];
  assert.equal(JSON.parse(moduleApi.serializeRegistry(registry))[0].id, "b");
});
