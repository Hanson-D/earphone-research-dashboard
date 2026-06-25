# 05 Report Export Module

This module turns dashboard analysis state into a portable report model.

It is independent from the base dashboard and does not decide the final export
format. Later integrations can render the model as:

- local printable HTML
- CSV summary
- PDF through browser print
- JSON archive for reproducibility

## Report Model

```json
{
  "title": "Earphone Research Report",
  "createdAt": "2026-06-25T00:00:00.000Z",
  "subject": { "name": "U001", "ear_side": "left" },
  "cohort": { "label": "left ear, age 20-40", "sampleSize": 532 },
  "percentiles": [
    { "field": "concha_width_mm", "percentile": 63.2, "value": 24.5 }
  ],
  "notes": []
}
```

The module deliberately avoids direct file writing. The host page or local
server should decide where exported files are saved.
