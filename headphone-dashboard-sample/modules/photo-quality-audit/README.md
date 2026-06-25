# 06 Photo Quality Audit Module

This module audits photo coverage before analysis.

It is independent from the base dashboard and works with row-oriented dashboard
records. The main use case is checking whether every selected
`subject * device * view` combination has a mapped photo path.

## Inputs

```json
{
  "records": [
    {
      "name": "U001",
      "device": "Prototype A",
      "front_photo": "photos/U001/A/front.jpg",
      "side_photo": ""
    }
  ],
  "subjectField": "name",
  "deviceField": "device",
  "viewColumns": [
    { "view": "front", "column": "front_photo" },
    { "view": "side", "column": "side_photo" }
  ]
}
```

## Outputs

- coverage rate
- missing subject/device/view combinations
- duplicate photo path warnings
- per-subject and per-device summaries

This module should later connect to the project photo mapping page, but it does
not depend on the current 01/02 implementation.
