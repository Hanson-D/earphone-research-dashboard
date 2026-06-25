# Dashboard Extension Modules

The base dashboard remains in the root sample app. Extension modules start from
`03` and are kept independent so they can be developed, tested, and merged back
without disrupting pages 01 and 02.

## Current Modules

- `03 sql-percentile`: map a selected subject to a local SQL ear database and
  compute percentiles for matched numeric fields.
- `04 cohort-builder`: define the comparison cohort used by percentile
  analysis, such as same ear side, sex, age range, prototype, or custom fields.
- `05 report-export`: convert selected subject data, percentile outputs, and
  analysis notes into a portable report model.
- `06 photo-quality-audit`: audit whether subject, device, and view photo
  combinations are complete before analysis.
- `07 protocol-template`: define expected study columns, numeric ranges, and
  photo views for project-level validation.
- `08 longitudinal-review`: compare repeated devices, sessions, or time points
  for the same subject.
- `09 device-effect-model`: estimate descriptive device-level effects across
  selected records and metrics.
- `10 annotation-review`: review free-text notes and tag recurring fit issues
  with transparent keyword rules.
- `11 study-dashboard-packager`: collect selected modules into a study-specific
  dashboard manifest with resources, entry points, and validation commands.
- `12 module-orchestrator`: define how independent modules exchange records,
  filters, analysis packages, and report models.
- `13 local-project-registry`: maintain multiple local dashboard projects and
  their manifests on the same machine.
- `14 study-audit-log`: track analysis runs, warnings, selected cohorts, and
  exported reports for reproducibility.
- `15 integration-adapter`: prepare static files, API routes, page entries, and
  validation commands for mounting selected modules into the base dashboard.
- `16 visual-grammar`: shared card, table, badge, percentile, and chart view
  models for analysis modules.
- `17 module-health-dashboard`: summarize module tests, contracts, and package
  readiness for maintainers.
- `18 base-app-bridge`: generate concrete patch plans for mounting selected
  modules into the existing base dashboard.
- `19 persistence-adapter`: define local JSON persistence contracts for project
  registry, audit log, study manifests, and module settings.

## Candidate Future Modules

- `20 study-app-blueprint`: combine modules, integration plans, persistence,
  and visual grammar into one project-specific application blueprint.
