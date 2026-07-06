# 07 Protocol Template Module

This module describes expected columns and validation rules for a research
protocol. It is independent from the base dashboard and can be used before data
loading, before photo mapping, or before SQL percentile analysis.

## Template Shape

```json
{
  "name": "Headphone Fit Study",
  "requiredFields": ["name", "device", "ear_side"],
  "recommendedFields": ["age", "sex", "concha_width_mm"],
  "numericRanges": {
    "satisfaction": [0, 10],
    "comfort": [0, 10],
    "stability": [0, 10]
  },
  "fieldRoles": {
    "name": "user_id",
    "device": "device",
    "comfort": "metric"
  },
  "photoViews": ["front", "side", "rear"],
  "photoSchema": {
    "ears": ["左耳", "右耳"],
    "views": ["正面", "侧面", "后侧"]
  }
}
```

## Output

The validator returns missing required fields, missing recommended fields,
out-of-range numeric values, and a compact validity summary. It does not mutate
the source data.
