# 04 Cohort Builder Module

This module defines comparison cohorts before percentile analysis.

Example use cases:

- Compare a selected left-ear record only with left-ear records in the SQL
  database.
- Restrict percentiles to a specific age range or sex.
- Build a cohort from several matched fields while reporting the cohort size.

The module is independent from the base dashboard. It exposes pure JavaScript
helpers for browser-side configuration and a small Python query builder for the
local SQLite server.

## Filter Model

```json
[
  { "column": "ear_side", "operator": "equals", "value": "left" },
  { "column": "age", "operator": "between", "value": [20, 40] },
  { "column": "sex", "operator": "in", "value": ["female", "male"] }
]
```

Supported operators:

- `equals`
- `not_equals`
- `between`
- `in`
- `is_not_null`

The Python builder validates all column names against schema metadata and uses
parameter binding for values.
