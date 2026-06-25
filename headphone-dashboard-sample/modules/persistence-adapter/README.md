# 19 Persistence Adapter Module

This module defines local JSON persistence contracts for independent dashboard
modules.

It does not read or write the filesystem. The local server can later use this
contract to persist project registry, study manifests, audit logs, and module
settings under a user-selected projects directory.

## Responsibilities

- define known persistence document types
- wrap payloads in versioned envelopes
- validate required fields
- build read/write operation plans
- generate stable default file names

## Document Types

- `project-registry`
- `study-manifest`
- `audit-log`
- `module-settings`
