# AMTP over HTTP Binding

## Status

**Stable** — This binding is part of the AMTP 1.0 specification.

## Overview

AMTP is designed as an HTTP-native protocol. All AMTP interactions happen using standard HTTP methods, status codes, and headers, with content negotiation via the `Accept` header.

## Core Rules

### 1. Content Negotiation

Clients MUST send one of the following in the `Accept` header:

- `text/amtp+markdown`
- `application/amtp+markdown`
- `text/markdown`

If the server supports AMTP, it SHOULD respond with:

```http
Content-Type: text/amtp+markdown; charset=utf-8
X-AMTP-Version: 1.0
```

Fallback behavior (when client does not request AMTP):

- `text/html` → Human-friendly HTML rendering
- `application/json` → Structured JSON (for API clients)

### 2. Methods and Semantics

| HTTP Method | AMTP Usage                          | Idempotent |
|-------------|-------------------------------------|------------|
| GET         | Fetch document or execute read-only action | Yes |
| POST        | Submit forms or invoke actions      | No (usually) |
| PUT         | Replace resource state              | Yes |
| PATCH       | Partial update                      | No |
| DELETE      | Remove resource                     | Yes |

### 3. Headers

**Request Headers**

- `Accept`: Content negotiation (required for agents)
- `Authorization`: Bearer tokens, API keys, etc.
- `X-Session-ID`: Optional persistent session identifier
- `X-Request-ID`: Unique request correlation ID (recommended)

**Response Headers**

- `Content-Type: text/amtp+markdown`
- `X-AMTP-Version: 1.0`
- `X-Session-ID`: Echoed or newly created session
- `Link: <...>; rel="next"` — for pagination

### 4. Status Codes

AMTP reuses standard HTTP status codes with the following semantics:

- `200 OK` — Successful document or action result
- `201 Created` — New resource created (e.g. after form submission)
- `204 No Content` — Action succeeded with no body
- `400 Bad Request` — Malformed AMTP document or invalid action
- `401 Unauthorized` — Missing or invalid authentication
- `403 Forbidden` — Insufficient permissions for action
- `404 Not Found` — Document or action endpoint does not exist
- `429 Too Many Requests` — Rate limit exceeded

### 5. Caching

AMTP responses are fully cacheable using standard HTTP caching:

- `Cache-Control`
- `ETag`
- `Last-Modified`

Agents SHOULD respect these headers.

## Streaming

See the streaming specification (to be added in `streaming.md`).

## Security Considerations

- All sensitive actions MUST be protected by CSRF tokens when using cookies.
- `X-Session-ID` must be treated as a bearer credential.
- Servers MUST validate all action IDs and form field names against an allowlist.

## Examples

**Request**

```http
GET /products/mbp-14 HTTP/1.1
Host: example.com
Accept: text/amtp+markdown
Authorization: Bearer eyJ...
```

**Response**

```http
HTTP/1.1 200 OK
Content-Type: text/amtp+markdown; charset=utf-8
X-AMTP-Version: 1.0
Cache-Control: public, max-age=300

# MacBook Pro 14" M3
...
```

This binding ensures AMTP works seamlessly with existing web infrastructure (CDNs, proxies, load balancers, browsers, and agents).
