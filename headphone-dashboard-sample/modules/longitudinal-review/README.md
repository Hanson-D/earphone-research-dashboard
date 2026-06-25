# 08 Longitudinal Review Module

This module compares repeated records for the same subject. In the headphone
dashboard context, repeated records may represent different devices, different
sessions, or different time points.

It is independent from the base dashboard and expects row-oriented records from
the CSV parser.

## Typical Inputs

```json
{
  "records": [
    { "name": "U001", "device": "A", "comfort": "7", "stability": "8" },
    { "name": "U001", "device": "B", "comfort": "9", "stability": "6" }
  ],
  "subjectField": "name",
  "conditionField": "device",
  "metricFields": ["comfort", "stability"]
}
```

## Outputs

- grouped subject records
- per-metric best condition
- pairwise condition deltas
- compact subject-level summary

This module can later be mounted as an optional detail panel for page 02 or used
by `05 report-export`.
