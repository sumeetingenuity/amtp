# AMTP-QL — Query Language for AMTP Documents

**Status:** Design (v2.0) — 2026-05-22

AMTP-QL is a minimal, GraphQL-inspired query language that lets agents request *only* the parts of an AMTP document they need.  
It is executed server-side against the parsed `AMTPDocument` AST, dramatically reducing token usage for large pages.

## Goals
- Token efficiency: agents fetch projections instead of full Markdown + full AST
- Simple & predictable: tiny subset of GraphQL (no mutations, no fragments, limited directives)
- First-class support for AMTP primitives: actions, forms, structured_data, pagination, nodes
- Easy to parse & execute in < 200 LOC
- Secure: queries are validated against allow-listed fields + sanitized args

## Syntax (Subset of GraphQL)

```
QueryDocument ::= "query" SelectionSet
SelectionSet  ::= "{" Selection ("," Selection)* "}"
Selection     ::= FieldName Arguments? SelectionSet?
Arguments     ::= "(" Argument ("," Argument)* ")"
Argument      ::= Name ":" Value
Value         ::= String | Number | Boolean | Null | List | Object
Name          ::= [a-zA-Z_][a-zA-Z0-9_]*
```

### Supported Root Fields
- `document` — the current (or `path:`) AMTPDocument
  - `title`, `path`, `version`
  - `metadata { ... }`
  - `pagination { ... }`
  - `actions { name description parameters {name type required} }`
  - `forms { name fields {name type required} }`
  - `links { text url }`
  - `structured_data { type data }`
  - `nodes(type: ["HEADING","PARAGRAPH",...] limit: N) { type content children { ... } }`

### Example Queries

```graphql
# Minimal — just actions + title
query {
  document {
    title
    actions { name description parameters { name type required } }
  }
}

# Structured data + pagination cursors
query {
  document {
    metadata { pageType updatedAt }
    pagination { hasNextPage nextCursor totalCount }
    structured_data { type data }
  }
}

# Filtered nodes + forms
query {
  document {
    nodes(type: ["HEADING", "PARAGRAPH"], limit: 20) {
      type
      content
    }
    forms {
      name
      fields { name type description }
    }
  }
}
```

## Execution Model
1. Client sends `POST /api/amtp/query` with `{ "query": "..." }`
2. Server parses AMTP-QL → validated AST
3. Executor walks the in-memory `AMTPDocument` (already parsed by markdown-parser)
4. Returns `AMTPQueryResult` (JSON) — much smaller than full document
5. Client can also use `amtpClient.query(ql)` helper

## Error Handling
- SyntaxError, UnknownFieldError, ValidationError → 400 with AMTP error envelope
- Security: depth limit (max 5), no introspection, arg sanitization

## TypeScript Integration
See `src/types/amtp.types.ts` for:
- `AMTPQLQuery`
- `AMTPQLResult`
- `AMTPQLSelection`
- `AMTPQLDocumentResult`

## Roadmap
- [x] Design (this doc)
- [ ] Types
- [ ] Parser + Executor
- [ ] Client + Server endpoint
- [ ] Tests + example in spec/examples/amtp-ql-examples.md
- [ ] Update RFC + IMPLEMENTATION-SUMMARY.md

## Relation to Other Standards
- Much lighter than full GraphQL (no schema SDL, no resolvers per field)
- Complementary to OpenAPI/AsyncAPI (those describe the transport; AMTP-QL describes *content selection*)
- Natural evolution of the existing `getPage` + pagination cursors

*AMTP-QL keeps agents fast, cheap, and focused.*
