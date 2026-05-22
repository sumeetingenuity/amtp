# AMTP Specification Examples

This directory contains canonical, minimal, and realistic AMTP documents used for:

- Specification conformance testing
- Documentation
- Parser validation
- Agent training / few-shot examples

## Files

- `product-page.md` — Typical product detail page with actions and metadata
- `checkout-form.md` — Multi-field form with strict ACTION/METHOD/ENDPOINT + FIELD definitions
- `dashboard.md` — SaaS-style workspace listing with actions

All files in this directory are guaranteed to pass:

```bash
npx ts-node bin/amtp.ts validate spec/examples/
```

They are also valid against `../schemas/amtp-document.schema.json`.
