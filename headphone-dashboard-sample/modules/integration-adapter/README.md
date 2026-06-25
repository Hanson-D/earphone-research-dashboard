# 15 Integration Adapter Module

This module prepares integration plans for mounting independent modules into the
base local dashboard without directly editing the base files.

It answers:

- Which static files need to be served?
- Which server APIs need to be mounted?
- Which page entries should be added?
- Which validation commands should run after integration?

The module produces a plan that can later be applied by a human or by a local
server integration script.

## Plan Shape

```json
{
  "modules": ["sql-percentile", "module-orchestrator"],
  "staticFiles": ["modules/sql-percentile/sql-percentile.js"],
  "apiRoutes": [{ "method": "POST", "path": "/api/sqlite-percentiles" }],
  "pageEntries": [{ "id": "sql-percentile", "label": "03 SQL Percentile" }],
  "testCommands": []
}
```
