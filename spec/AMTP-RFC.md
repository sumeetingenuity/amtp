# AMTP: Agent Markdown Transfer Protocol

**RFC-Style Specification**  
*HTTP for the Agentic Web*

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Core Concepts](#core-concepts)
4. [Protocol Overview](#protocol-overview)
5. [Markdown Page Structure](#markdown-page-structure)
6. [Actions System](#actions-system)
7. [Navigation & Hypermedia](#navigation--hypermedia)
8. [Sessions & Authentication](#sessions--authentication)
9. [Streaming Protocol](#streaming-protocol)
10. [Content Negotiation](#content-negotiation)
11. [Error Handling](#error-handling)
12. [Security Architecture](#security-architecture)
13. [Implementations](#implementations)
14. [Comparisons](#comparisons)
15. [Future Roadmap](#future-roadmap)

---

## Executive Summary

AMTP (Agent Markdown Transfer Protocol) is a semantic, markdown-first protocol designed for AI agents and headless browsers to interact with web services without requiring DOM rendering, CSS engines, or JavaScript execution.

**Key innovations:**
- **Markdown-native**: Pages are structured semantic markdown, not HTML
- **Agent-optimized**: Deterministic, token-efficient responses
- **HTTP-compatible**: Works as overlay protocol, no browser engine needed
- **Streaming-first**: Built for real-time updates via SSE/WebSocket
- **Hypermedia-native**: Maintains web architecture philosophy
- **Human-compatible**: Same endpoint serves browsers and agents via content negotiation

---

## Problem Statement

Current approaches for AI agents to interact with the web have significant limitations:

### Traditional HTML + Browser Automation
- **High latency**: Full DOM rendering, CSS parsing, JavaScript execution
- **Resource intensive**: Requires Chromium, Selenium, or similar engines
- **Not agent-friendly**: DOM structure varies, no semantic structure
- **Token waste**: LLMs must understand HTML markup, not content

### Unstructured APIs
- **Inconsistent**: Every API different contract and design
- **Not hypermedia**: Static, not navigable like the web
- **Limited discoverability**: Requires documentation, not self-describing

### Existing Standards (JSON APIs, GraphQL)
- **Not web-native**: Don't leverage HTTP, caching, content negotiation
- **Over-engineered for simple browsing**: Extra complexity for read-heavy agents
- **Limited session support**: No built-in concept of user workflows or state

### What We Need
A protocol that combines:
- **HTTP simplicity** (ubiquitous, cacheable, routing)
- **Markdown readability** (human and agent readable)
- **Semantic structure** (deterministic, navigable)
- **Agent capabilities** (actions, forms, streaming)
- **Session awareness** (stateful workflows)

---

## Core Concepts

### 1. Markdown-First Architecture

Pages are pure markdown documents with semantic structure:

```markdown
# E-Commerce Product Page

## Product Information

Name: MacBook Pro 14"
Price: $1999
Rating: 4.8/5 (12,450 reviews)
Stock: In Stock

Description: High-performance laptop for creative professionals

## Actions

[BUY] [ADD_TO_CART] [SAVE_FOR_LATER] [SHARE]

## Related Products

- [MacBook Air 13"](/products/air-13)
- [Mac Studio](/products/studio)
- [Magic Keyboard](/products/keyboard)

## Specifications

| Spec | Value |
|------|-------|
| Processor | M3 Pro |
| RAM | 18GB |
| Storage | 512GB SSD |
| Display | 14.2-inch Liquid Retina XDR |

## Customer Reviews

### 5 stars by Alice Chen
"Best laptop I've ever owned. Performance is incredible."

### 4 stars by Bob Johnson  
"Great machine, slightly expensive."
```

### 2. Action-Native Philosophy

Instead of clicking DOM nodes, agents invoke semantic actions:

```
POST /api/amtp/action
Content-Type: application/json

{
  "action": "BUY",
  "productId": "mbp-14-2024",
  "quantity": 1,
  "paymentMethod": "credit_card",
  "sessionId": "sess_abc123"
}
```

Actions are:
- **Named semantically** (BUY, SUBMIT_FORM, LOGIN, not CLICK_NODE_5)
- **Strongly typed** (parameters, schema validation)
- **Idempotent** where possible (important for agent retries)
- **Transactional** (atomic success/failure)
- **Permission-aware** (authorization built-in)

### 3. Content Negotiation

The same URL serves:
- HTML → traditional browsers
- Markdown (AMTP) → AI agents
- JSON → API clients

```http
GET /products/mbp-14

Accept: text/amtp+markdown
→ 200 OK, markdown response
Content-Type: text/amtp+markdown

---

Accept: text/html
→ 200 OK, HTML response
Content-Type: text/html

---

Accept: application/json
→ 200 OK, JSON API response
Content-Type: application/json
```

### 4. Session Continuity

Sessions persist across multiple AMTP requests, enabling:
- Multi-step workflows (login → browse → checkout)
- Conversation continuity (agent remembers context)
- Idempotent retries (safely resubmit actions)
- State tracking (shopping cart, preferences)

---

## Protocol Overview

### Request Format

```http
GET /products/mbp-14
Host: example.com
Accept: text/amtp+markdown
User-Agent: AMTP-Agent/1.0
X-AMTP-Capabilities: actions,streaming,forms,tools
X-Session-ID: sess_abc123
```

**Headers:**
- `Accept`: Content type negotiation
- `X-AMTP-Capabilities`: Agent capabilities declaration
- `X-Session-ID`: Persistent session identifier
- `X-Agent-Identity`: Optional agent identification
- `X-Agent-Context`: Optional agent context/preferences

### Response Format

```http
HTTP/1.1 200 OK
Content-Type: text/amtp+markdown
X-AMTP-Version: 1.0
X-AMTP-Next-Action: [LIST_RECOMMENDED_ACTIONS]
Cache-Control: public, max-age=3600
X-Session-ID: sess_abc123
ETag: "abc123"
```

**Response body**: Valid markdown document with AMTP semantic extensions

**Headers:**
- `Content-Type`: `text/amtp+markdown`
- `X-AMTP-Version`: Protocol version
- `X-Session-ID`: Session identifier
- `Cache-Control`: Standard HTTP caching
- `X-AMTP-Next-Action`: Suggested next actions

### Response Status Codes

Standard HTTP status codes apply:

- `200 OK`: Successful response
- `201 Created`: Action created resource
- `202 Accepted`: Action queued/processing
- `204 No Content`: Action succeeded, no response body
- `400 Bad Request`: Invalid action parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Action not permitted
- `404 Not Found`: Resource not found
- `409 Conflict`: Action conflicts with state
- `422 Unprocessable Entity`: Validation failed
- `429 Too Many Requests`: Rate limited
- `500 Internal Server Error`: Server error

---

## Markdown Page Structure

### Document Structure

```markdown
# Page Title

## Section
Content here...

### Subsection
More content...

## Actions

[ACTION_NAME] [ANOTHER_ACTION]

## Links

- [Link Text](/path)
- [External](https://external.com)

## Forms

ACTION: submit_form
METHOD: POST

FIELD: email
TYPE: email
REQUIRED: true

FIELD: password  
TYPE: password
REQUIRED: true

FIELD: remember_me
TYPE: checkbox
DEFAULT: false

## Metadata

```amtp-meta
{
  "page_id": "product-detail",
  "type": "product",
  "version": "1.0",
  "updated_at": "2024-05-22T10:30:00Z"
}
```

```

### Semantic Elements

#### Actions

Markdown link syntax extended for actions:

```markdown
[BUY] — inline action button
[ADD_TO_CART] — inline action button

## Actions

- [BUY] Buy this product immediately
- [ADD_TO_CART] Add to shopping cart
- [SAVE_FOR_LATER] Save to wishlist
- [SHARE] Share with others
```

#### Forms

AMTP forms are defined as markdown with field specifications:

```markdown
## Contact Form

ACTION: send_message
METHOD: POST
ENDPOINT: /contact/send

FIELD: name
TYPE: text
LABEL: Your Name
REQUIRED: true
PLACEHOLDER: John Doe

FIELD: email
TYPE: email
LABEL: Email Address
REQUIRED: true
VALIDATION: email

FIELD: subject
TYPE: select
LABEL: Subject
OPTIONS: General,Support,Sales,Bug Report
REQUIRED: true

FIELD: message
TYPE: textarea
LABEL: Your Message
REQUIRED: true
MAX_LENGTH: 5000

FIELD: subscribe
TYPE: checkbox
LABEL: Subscribe to newsletter
DEFAULT: false
```

#### Navigation

Navigation is expressed as semantic links:

```markdown
## Navigation

[← Back to Products](/products)
[Next: Checkout →](/checkout)

## Related

- [Similar Products](/products?similar)
- [Customer Reviews](/products/mbp-14/reviews)
- [Specifications](/products/mbp-14/specs)
```

#### Structured Data

Inline structured metadata:

```markdown
## Product Details

```amtp-data
{
  "type": "Product",
  "name": "MacBook Pro 14\"",
  "price": {
    "currency": "USD",
    "amount": 1999.00
  },
  "rating": 4.8,
  "reviewCount": 12450,
  "inStock": true,
  "sku": "MBP14-2024-M3PRO",
  "url": "https://example.com/products/mbp-14"
}
```
```

### Markdown Grammar

```ebnf
AMTP_Document := Header Sections?
Header := H1_Title
Sections := Section+
Section := Section_Title Content*
Content := Paragraph | ListItem | Table | CodeBlock | Action | Form | Link | Metadata
Action := "[" ACTION_NAME "]" Description?
Form := "ACTION:" FormName "METHOD:" Method Fields+
Field := "FIELD:" FieldName "TYPE:" FieldType FieldProperties*
Link := "[" LinkText "]" "(" URL ")"
Metadata := "```amtp-meta" JSON "```" | "```amtp-data" JSON "```"
```

---

## Actions System

### Action Definition

Actions are semantic, strongly-typed operations that agents can invoke:

```json
{
  "action": {
    "id": "buy",
    "label": "Buy Now",
    "description": "Purchase this product immediately",
    "method": "POST",
    "endpoint": "/api/actions/buy",
    "parameters": [
      {
        "name": "productId",
        "type": "string",
        "required": true,
        "description": "Product identifier"
      },
      {
        "name": "quantity",
        "type": "integer",
        "required": false,
        "default": 1,
        "description": "Quantity to purchase"
      },
      {
        "name": "paymentMethod",
        "type": "string",
        "enum": ["credit_card", "paypal", "apple_pay", "google_pay"],
        "required": true,
        "description": "Payment method to use"
      }
    ],
    "requires_authentication": true,
    "idempotent": false,
    "timeout_ms": 30000,
    "expected_outcomes": [
      "order_created",
      "payment_processed",
      "order_confirmation_sent"
    ]
  }
}
```

### Action Invocation

```http
POST /api/amtp/action
Content-Type: application/json
X-Session-ID: sess_abc123

{
  "action": "buy",
  "productId": "mbp-14-2024",
  "quantity": 1,
  "paymentMethod": "credit_card"
}
```

### Action Response

```http
HTTP/1.1 201 Created
Content-Type: application/json
X-Session-ID: sess_abc123

{
  "status": "success",
  "action": "buy",
  "result": {
    "orderId": "ord_xyz789",
    "totalPrice": 1999.00,
    "estimatedDelivery": "2024-05-29",
    "confirmationUrl": "/orders/ord_xyz789"
  },
  "next_actions": [
    "TRACK_ORDER",
    "DOWNLOAD_INVOICE",
    "CONTACT_SUPPORT"
  ],
  "redirect_to": "/orders/ord_xyz789"
}
```

### Built-in Actions

Common actions all AMTP servers support:

- `NAVIGATE` — Navigate to URL
- `SUBMIT_FORM` — Submit a form
- `SCROLL` — Scroll to position/section
- `SEARCH` — Search page content
- `LOGIN` — Authenticate
- `LOGOUT` — End session
- `GET_SESSION_INFO` — Retrieve session metadata
- `REFRESH` — Refresh current page

---

## Navigation & Hypermedia

### RESTful Navigation

AMTP uses standard HTTP and URL-based navigation:

```
GET /products → Product listing
GET /products/mbp-14 → Product detail
GET /products/mbp-14/reviews → Product reviews
POST /cart/items → Add to cart (action)
GET /cart → View cart
POST /checkout → Begin checkout (action)
```

### Pagination

Pagination is expressed via semantic actions and metadata:

```markdown
## Products (Page 1 of 50)

- [Product 1](/products/1)
- [Product 2](/products/2)
- ...
- [Product 20](/products/20)

## Pagination

[← Previous](/products?page=prev)
[Next →](/products?page=2)
[Jump to](/products?page=10)

Page: 1 / 50
Total Items: 1000
Per Page: 20
```

### State Transitions

Actions can trigger state transitions:

```markdown
## Shopping Workflow

Current State: BROWSING
Available Actions: [ADD_TO_CART] [COMPARE] [SAVE_FOR_LATER]

---

After [ADD_TO_CART]:
→ State: CART_UPDATED
→ Next: [VIEW_CART] [CONTINUE_SHOPPING] [CHECKOUT]
```

---

## Sessions & Authentication

### Session Management

Sessions are persistent across requests:

```http
POST /api/amtp/session
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "secret"
}
```

Response:

```json
{
  "session_id": "sess_abc123",
  "user_id": "usr_xyz",
  "username": "user@example.com",
  "expires_at": "2024-05-29T02:35:32Z",
  "capabilities": ["read", "write", "checkout"],
  "preferences": {
    "language": "en",
    "timezone": "UTC"
  }
}
```

### Authentication Methods

1. **Session Token**: Opaque token in `X-Session-ID` header
2. **Bearer Token**: OAuth-style bearer token in Authorization header
3. **JWT**: Signed JWT tokens for stateless auth
4. **API Key**: Long-lived API key for machine-to-machine

### Authorization

Actions respect permissions:

```json
{
  "action": "DELETE_USER",
  "user_id": "usr_123",
  "requires_permission": "admin:users:delete",
  "current_user_permissions": ["user:read", "user:write"],
  "status": "error",
  "reason": "INSUFFICIENT_PERMISSION"
}
```

---

## Streaming Protocol

### Server-Sent Events (SSE)

Long-lived connections for live updates:

```http
GET /api/amtp/stream/cart
Accept: text/event-stream
X-Session-ID: sess_abc123
```

Response:

```
event: item_added
data: {"itemId": "mbp-14", "quantity": 1, "price": 1999.00}

event: price_updated
data: {"itemId": "mbp-14", "oldPrice": 1999.00, "newPrice": 1899.00}

event: stock_warning
data: {"itemId": "mbp-14", "remaining": 5}
```

### WebSocket

Real-time bidirectional communication:

```javascript
ws = new WebSocket("wss://example.com/api/amtp/ws");
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log(update); // {type: "PAGE_UPDATE", content: "..."}
};
```

### HTTP Streaming

Streaming responses over HTTP:

```http
GET /api/amtp/search?q=macbook
Accept: text/amtp+markdown
Transfer-Encoding: chunked
```

Response streams markdown chunks as results arrive.

---

## Content Negotiation

### MIME Types

Recommended MIME types:

```
text/amtp+markdown          — AMTP markdown (primary)
application/amtp+markdown   — Alternative MIME type
text/markdown               — Generic markdown fallback
text/html                   — HTML for browsers
application/json            — JSON API
```

### Capability Negotiation

Agents declare capabilities:

```http
GET /products/mbp-14
X-AMTP-Capabilities: actions,streaming,forms,tools,multimodal,pagination
```

Server responds with appropriate features:

```markdown
## Actions

[BUY] [ADD_TO_CART] — Standard actions

## Streaming

See `/api/amtp/stream/product/mbp-14` for live updates

## Form

Support for complex forms (multipart, file upload)

## Tools

Integration with external tools and services
```

### Accept Header Precedence

1. Explicit `Accept` header (highest priority)
2. URL parameter: `?format=markdown`
3. Header `X-AMTP-Format`
4. User-Agent analysis
5. Default: HTML for browsers, markdown for agent User-Agents

---

## Error Handling

### Error Response Format

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid product ID",
    "details": [
      {
        "field": "productId",
        "error": "Must be alphanumeric, 1-50 characters"
      }
    ],
    "request_id": "req_abc123",
    "timestamp": "2024-05-22T02:35:32Z"
  }
}
```

### Common Error Codes

```
AUTH_REQUIRED — Authentication needed
PERMISSION_DENIED — Action not allowed
INVALID_REQUEST — Malformed request
VALIDATION_ERROR — Parameter validation failed
RESOURCE_NOT_FOUND — Resource doesn't exist
RATE_LIMITED — Too many requests
SERVER_ERROR — Internal server error
SERVICE_UNAVAILABLE — Service temporarily down
```

### Retry Policy

Agents should implement exponential backoff:

- 400, 401, 403, 404, 422: Do not retry
- 429: Retry with backoff (respect Retry-After)
- 500, 503: Retry with exponential backoff (max 3-5 retries)

---

## Security Architecture

### Input Validation

All parameters must be validated:

1. **Type validation** — Ensure correct data type
2. **Format validation** — Email, URL, phone number patterns
3. **Range validation** — Min/max values, length limits
4. **Whitelist validation** — Enum values only
5. **Injection prevention** — Escape/sanitize user input

### Authentication

- Use HTTPS only
- Tokens/sessions should be:
  - Time-limited
  - Cryptographically signed
  - Stored securely on server
  - Transmitted only in secure channels

### CSRF Protection

- Use SameSite cookie attribute
- Token-based CSRF protection for state-changing operations
- Double-submit cookie pattern

### Rate Limiting

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1653193532
```

### Data Protection

- Encrypt sensitive data in transit (HTTPS)
- Encrypt sensitive data at rest (database)
- Implement least-privilege access
- Audit log security-relevant events

---

## Implementations

See separate implementation guides:

1. **Server Implementation** (`src/server/`)
2. **Client/Agent SDK** (`src/client/`)
3. **Crawler/Indexer** (`src/crawler/`)

---

## Comparisons

### vs. HTTP + HTML

**HTML:**
- ✅ Universal, mature ecosystem
- ❌ Not designed for agents
- ❌ Requires full rendering engine
- ❌ High token cost for LLMs

**AMTP:**
- ✅ Agent-first design
- ✅ No rendering needed
- ✅ Low token cost
- ✅ Semantic structure built-in

### vs. JSON APIs

**JSON:**
- ✅ Machine-readable, standard format
- ❌ Not hypermedia-native
- ❌ Static, not self-describing
- ❌ No built-in navigation

**AMTP:**
- ✅ Hypermedia navigation built-in
- ✅ Semantic structure obvious
- ✅ Self-describing (markdown + metadata)
- ✅ One format for all interactions

### vs. GraphQL

**GraphQL:**
- ✅ Flexible query language
- ✅ Strongly typed
- ❌ Over-engineered for browsing
- ❌ Requires query language knowledge

**AMTP:**
- ✅ Simple HTTP requests
- ✅ Hypermedia navigation
- ✅ Lower barrier to entry
- ✅ Cache-friendly

### vs. MCP (Model Context Protocol)

**MCP:**
- ✅ Agent tool invocation
- ❌ Not HTTP-native
- ❌ Not designed for web browsing
- ❌ JSON-based only

**AMTP:**
- ✅ HTTP-native
- ✅ Web browsing built-in
- ✅ Markdown + JSON
- ✅ Content negotiation support

### vs. Browser Automation

**Selenium/Puppeteer:**
- ✅ Works with any website
- ❌ High latency (full DOM render)
- ❌ Resource intensive
- ❌ Fragile (depends on DOM selectors)

**AMTP:**
- ✅ Low latency
- ✅ Resource efficient
- ✅ Robust (semantic actions)
- ✅ Agent-first design

---

## Future Roadmap

### Version 1.1 (Q3 2024)
- [ ] Multimedia support (images, video references)
- [ ] Natural language action descriptions
- [ ] Advanced filtering and querying

### Version 2.0 (Q4 2024)
- [ ] Multi-agent coordination
- [ ] Distributed session management
- [ ] Advanced caching strategies
- [ ] Webhook support for push updates

### Version 3.0 (Q1 2025)
- [ ] Voice interface compatibility
- [ ] Mobile optimization
- [ ] Blockchain integration for transactions
- [ ] Federated identity support

---

## References

- [RFC 7231 - HTTP/1.1 Semantics](https://tools.ietf.org/html/rfc7231)
- [RFC 7578 - multipart/form-data](https://tools.ietf.org/html/rfc7578)
- [CommonMark Spec](https://spec.commonmark.org/)
- [JSON Schema](https://json-schema.org/)
- [Hypermedia Types](https://tools.ietf.org/html/draft-kelly-json-hal)

---

**AMTP is the protocol for the agentic web.**

*Designed for AI agents, built on web standards, compatible with everything.*
