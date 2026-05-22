# AMTP Schemas

This directory contains official machine-readable schemas for AMTP documents.

## Available Schemas

- [amtp-document.schema.json](./amtp-document.schema.json) — Full JSON Schema (Draft 2020-12) for `AMTPDocument`
- [amtp-openapi.yaml](./amtp-openapi.yaml) — OpenAPI 3.1 spec for AMTP HTTP endpoints and document structure
- [amtp-asyncapi.yaml](./amtp-asyncapi.yaml) — AsyncAPI 3.0 spec for AMTP streaming events (SSE/WebSocket)

## Usage

### Validation (Node.js / ajv)

```ts
import Ajv from "ajv";
import schema from "./amtp-document.schema.json" assert { type: "json" };

const ajv = new Ajv({ strict: false });
const validate = ajv.compile(schema);

const isValid = validate(parsedDocument);
```

### Validation (CLI)

```bash
npx ajv validate -s spec/schemas/amtp-document.schema.json -d my-document.json
```

## Relationship to TypeScript Types

These schemas are derived from (and kept in sync with) the canonical definitions in:

`src/types/amtp.types.ts`

When the TypeScript types change, the schemas in this directory should be regenerated or manually updated.

## Future Schemas

- `action.schema.json`
- `form.schema.json`

The OpenAPI and AsyncAPI specs already provide the primary machine-readable interface definitions.

Contributions welcome.
