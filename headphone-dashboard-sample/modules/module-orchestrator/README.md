# 12 Module Orchestrator Module

This module defines how independent dashboard modules exchange data.

It does not import or execute the other modules directly. Instead, it provides a
small workflow contract:

- each step has a module name
- each step declares required input keys
- each step declares output keys
- the orchestrator validates whether a context can run the workflow
- synchronous handlers can be executed in order for local tests or demos

## Example Workflow

```json
[
  {
    "id": "cohort",
    "module": "cohort-builder",
    "requires": ["selectedRecord"],
    "provides": ["cohortFilters"]
  },
  {
    "id": "percentile",
    "module": "sql-percentile",
    "requires": ["selectedRecord", "cohortFilters", "databasePath"],
    "provides": ["percentileAnalysis"]
  },
  {
    "id": "report",
    "module": "report-export",
    "requires": ["selectedRecord", "percentileAnalysis"],
    "provides": ["reportModel"]
  }
]
```

This module is the bridge between independent module development and eventual
integration into the base dashboard.
