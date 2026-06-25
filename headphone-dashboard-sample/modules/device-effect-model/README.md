# 09 Device Effect Model Module

This module estimates device-level effects from row-oriented dashboard records.

It is intentionally lightweight and independent from the base dashboard. The
first version computes descriptive device effects:

- sample size per device
- mean and standard deviation for each metric
- global mean for each metric
- device delta from the global mean
- ranked devices per metric

This is not a causal model. It is a practical screening layer for research
review. Later versions can add subject fixed effects, mixed models, or cohort
adjustment if the study design supports it.

## Input

```json
{
  "records": [
    { "device": "A", "comfort": "7", "stability": "8" },
    { "device": "B", "comfort": "9", "stability": "6" }
  ],
  "deviceField": "device",
  "metricFields": ["comfort", "stability"]
}
```
