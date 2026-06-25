const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./module-orchestrator");

test("validateWorkflow reports missing required context keys", () => {
  const workflow = [
    { id: "a", module: "one", requires: ["selectedRecord"], provides: ["recordSummary"] },
    { id: "b", module: "two", requires: ["recordSummary", "databasePath"], provides: ["analysis"] }
  ];
  const validation = moduleApi.validateWorkflow(workflow, { selectedRecord: { name: "U001" } });
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.issues, [
    { stepId: "b", module: "two", missing: ["databasePath"] }
  ]);
  assert.ok(validation.availableKeys.includes("analysis"));
});

test("runWorkflow executes handlers in order and merges outputs", () => {
  const workflow = [
    { id: "cohort", module: "cohort-builder", requires: ["selectedRecord"], provides: ["cohortFilters"] },
    { id: "percentile", module: "sql-percentile", requires: ["cohortFilters"], provides: ["percentileAnalysis"] }
  ];
  const result = moduleApi.runWorkflow(workflow, {
    selectedRecord: { ear_side: "left" }
  }, {
    cohort: context => ({
      cohortFilters: [{ column: "ear_side", operator: "equals", value: context.selectedRecord.ear_side }]
    }),
    percentile: context => ({
      percentileAnalysis: { cohortFiltered: Boolean(context.cohortFilters.length), resultCount: 1 }
    })
  });
  assert.equal(result.context.percentileAnalysis.resultCount, 1);
  assert.deepEqual(result.log.map(item => item.stepId), ["cohort", "percentile"]);
});

test("buildDefaultSqlReportWorkflow defines 03/04/05 exchange contract", () => {
  const workflow = moduleApi.buildDefaultSqlReportWorkflow();
  assert.deepEqual(workflow.map(step => step.module), ["cohort-builder", "sql-percentile", "report-export"]);
  const validation = moduleApi.validateWorkflow(workflow, {
    selectedRecord: { name: "U001" },
    databasePath: "ear.sqlite",
    table: "ear_data"
  });
  assert.equal(validation.valid, true);
});

test("workflowToMarkdown renders readable steps", () => {
  const markdown = moduleApi.workflowToMarkdown([
    { id: "report", module: "report-export", requires: ["analysis"], provides: ["reportModel"] }
  ]);
  assert.equal(markdown, "1. report (report-export): analysis -> reportModel");
});
