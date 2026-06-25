# 16 Visual Grammar Module

This module provides shared display models for analysis modules.

It does not render DOM, canvas, or SVG. Instead, it normalizes analytical data
into consistent view models for cards, tables, status badges, and bar charts.

## Responsibilities

- map status types to labels and tones
- classify percentile bands consistently
- build table models with aligned columns
- build simple bar chart models from metric rows
- generate compact legends for charts and reports

This keeps independently developed modules visually compatible when they are
mounted back into the base dashboard.
