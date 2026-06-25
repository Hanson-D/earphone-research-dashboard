# 11 Study Dashboard Packager Module

This module describes a study-specific dashboard bundle without modifying the
base dashboard.

It answers practical questions:

- Which independent modules does this study need?
- Which entry files and tests should be included?
- Which local resources are required, such as CSV files, photos, or SQLite
  databases?
- Is the selected module list complete enough for the requested workflows?

The first version creates a manifest and validates module availability. Later it
can generate a physical bundle for Windows users.

## Manifest Shape

```json
{
  "studyName": "Headphone Fit Study",
  "modules": ["sql-percentile", "cohort-builder", "report-export"],
  "resources": [
    { "type": "csv", "path": "data/headphone.csv" },
    { "type": "sqlite", "path": "data/ear.sqlite" }
  ],
  "entryPoints": ["index.html"]
}
```
