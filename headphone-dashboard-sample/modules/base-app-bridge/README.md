# 18 Base App Bridge Module

This module turns integration plans into concrete base-app patch descriptions.

It does not edit `index.html`, `app.js`, or `server.py`. Instead, it generates a
structured patch plan with target files, anchors, and insertion summaries. This
keeps module development independent while making the eventual merge explicit.

## Responsibilities

- map page entries to `index.html` insertion plans
- map static module scripts to `app.js` initialization plans
- map API routes to `server.py` route plans
- validate that an integration plan has enough information to bridge
- render a human-readable checklist
