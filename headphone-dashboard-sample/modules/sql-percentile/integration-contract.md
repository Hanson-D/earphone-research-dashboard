# 03 SQL Percentile Integration Contract

This module is intentionally isolated from the base dashboard pages. It can be
mounted later without changing its core matching and percentile logic.

## Entry From Page 02

Page 02 should pass one selected dashboard row to page 03.

```json
{
  "subjectId": "U001",
  "source": "dashboard-detail",
  "record": {
    "name": "User 001",
    "earSide": "left",
    "prototype": "Device A",
    "concha_width_mm": "24.5",
    "age": "32"
  }
}
```

`record` may contain any CSV columns. The module only attempts percentile
analysis for values that can be parsed as finite numbers.

## Required Local APIs

The first integration pass can mount these APIs in the existing local server.

### GET `/api/sqlite-schema`

Query:

- `path`: local SQLite database path.

Response:

```json
{
  "tables": [
    {
      "name": "ear_data",
      "columns": [
        { "name": "concha_width", "type": "REAL", "numeric": true }
      ]
    }
  ]
}
```

### POST `/api/sqlite-percentiles`

Request:

```json
{
  "databasePath": "/path/to/ear.sqlite",
  "table": "ear_data",
  "cohortFilters": [
    { "column": "ear_side", "operator": "equals", "value": "left" },
    { "column": "age", "operator": "between", "value": [20, 40] }
  ],
  "mappings": [
    {
      "dashboardField": "concha_width_mm",
      "dbColumn": "concha_width",
      "value": 24.5
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "table": "ear_data",
  "cohortFiltered": true,
  "resultCount": 1,
  "warningCount": 0,
  "results": [
    {
      "dashboardField": "concha_width_mm",
      "dbColumn": "concha_width",
      "value": 24.5,
      "sampleSize": 10000,
      "percentile": 63.2,
      "rank": 6320,
      "belowCount": 6319,
      "equalCount": 1,
      "min": 12.1,
      "max": 38.4,
      "mean": 24.0,
      "sd": 3.2,
      "zScore": 0.16
    }
  ],
  "warnings": []
}
```

Warnings are non-fatal. They should be displayed to the user because they often
mean a selected dashboard field could not be matched to a usable SQL column or
the filtered cohort contains no valid numeric values.

## Local Privacy Boundary

- The SQL database path is local-only.
- The server should bind to `127.0.0.1` by default.
- No database rows should be returned to the browser for percentile analysis;
  only schema metadata and aggregate results are required.
- If cohort filtering is added, the API should return cohort counts and
  aggregate summaries, not raw identifiable records.

## Optional Cohort Contract

Module `04 cohort-builder` can produce `cohortFilters` before this module calls
the percentile API. Percentiles should then be computed against the filtered
comparison set instead of the whole SQL table.

The first integration should support two modes:

- `all`: ignore `cohortFilters` and compare with all non-null values.
- `matched`: apply the validated filters and return the filtered sample size.

## Packaging Contract

Module `11 study-dashboard-packager` should include these assets when a study
selects SQL percentile analysis:

- `sql-percentile/sql-percentile.js`
- `sql-percentile/sql-percentile-page.html`
- `sql-percentile/sql-percentile.css`
- `sql-percentile/sql_percentile.py`
- `sql-percentile/sql_percentile_api.py`
- `sql-percentile/sql_percentile_cli.py`

Recommended validation commands:

- `node --test modules/sql-percentile/sql-percentile.test.js`
- `python3 modules/sql-percentile/sql_percentile_test.py`
- `python3 modules/sql-percentile/sql_percentile_api_test.py`
- `python3 modules/sql-percentile/sql_percentile_cli_test.py`

## Orchestration Contract

Module `12 module-orchestrator` should treat SQL percentile analysis as a step
with this exchange shape:

Input context keys:

- `selectedRecord`
- `databasePath`
- `table`
- `cohortFilters` optional; produced by `04 cohort-builder`
- `mappings` optional; can be user-confirmed mappings or suggested mappings

Output context keys:

- `percentileAnalysis`: response-compatible object containing `results`,
  `warnings`, `resultCount`, and `warningCount`
- `analysisPackage`: browser-side package containing cards, explanations, and
  exportable JSON/CSV data

Audit handoff:

- Module `14 study-audit-log` should receive `projectId`, `subjectId`, `cohort`,
  `percentileAnalysis`, and exported artifacts to create a reproducible run
  entry for each SQL percentile analysis.
