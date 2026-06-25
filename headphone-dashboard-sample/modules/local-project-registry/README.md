# 13 Local Project Registry Module

This module manages multiple local dashboard projects on the same machine.

It is independent from the base dashboard and does not write files directly.
The local server can later persist the registry as JSON under the user's chosen
projects directory.

## Project Entry

```json
{
  "id": "headphone-fit-2026",
  "name": "Headphone Fit 2026",
  "projectPath": "D:/research/projects/headphone-fit-2026",
  "manifestPath": "D:/research/projects/headphone-fit-2026/manifest.json",
  "lastOpenedAt": "2026-06-25T00:00:00.000Z"
}
```

## Responsibilities

- create or update project entries
- track last-opened ordering
- validate required paths
- produce a compact project picker model
