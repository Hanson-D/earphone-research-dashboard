# 14 Study Audit Log Module

This module tracks analysis runs for reproducibility.

It is independent from the base dashboard and does not write files directly.
The local server can later persist the audit log next to the project manifest.

## Audit Entry

```json
{
  "id": "run-001",
  "projectId": "headphone-fit-2026",
  "module": "sql-percentile",
  "createdAt": "2026-06-25T00:00:00.000Z",
  "subjectId": "U001",
  "cohort": { "label": "ear_side: left", "sampleSize": 532 },
  "summary": { "resultCount": 3, "warningCount": 0 },
  "warnings": [],
  "artifacts": [{ "type": "csv", "path": "exports/u001-percentile.csv" }]
}
```

## Responsibilities

- create run entries from module outputs
- append entries to an in-memory log
- query by project, subject, module, or warning status
- export JSON/CSV summaries
