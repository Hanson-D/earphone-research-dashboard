# 10 Annotation Review Module

This module reviews free-text notes with transparent keyword rules.

It is independent from the base dashboard and does not use external NLP
services. The first version is deliberately simple and auditable:

- combine selected text columns
- tag notes by keyword rules
- count tag frequency
- list records that need manual review

## Rule Example

```json
[
  { "tag": "pressure", "keywords": ["压", "夹", "疼", "pressure"] },
  { "tag": "loose_fit", "keywords": ["松", "掉", "loose"] }
]
```

Later versions can add regex rules, reviewer workflows, and adjudication.
