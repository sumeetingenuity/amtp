# AMTP Architecture & Design Decisions

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT / AGENT                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AMTP Client SDK                                       │  │
│  │  - Page fetching (GET)                                 │  │
│  │  - Action execution (POST)                             │  │
│  │  - Form submission                                     │  │
│  │  - Streaming handling                                  │  │
│  │  - Session management                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP Request
                            │ Accept: text/amtp+markdown
                            │ X-Session-ID: ...
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │  Content Negotiation Middleware                         │ │
│ │  Determines response format (AMTP, HTML, JSON)         │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                      │
│ ┌──────────────────────▼──────────────────────────────────┐ │
│ │  AMTP Middleware                                        │ │
│ │  - Request parsing                                      │ │
│ │  - Session validation                                   │ │
│ │  - Permission checking                                  │ │
│ │  - Context building                                     │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                      │
│ ┌──────────────────────▼──────────────────────────────────┐ │
│ │  Route Handlers                                         │ │
│ │  - GET /resource (returns markdown)                    │ │
│ │  - POST /action (executes action)                      │ │
│ │  - POST /form (submits form)                           │ │
│ │  - GET /stream (opens connection)                      │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                      │
│ ┌──────────────────────▼──────────────────────────────────┐ │
│ │  Response Builder                                       │ │
│ │  - Markdown generation                                  │ │
│ │  - Metadata injection                                   │ │
│ │  - Link/action formatting                               │ │
│ │  - Cache headers                                        │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                      │
│ ┌──────────────────────▼──────────────────────────────────┐ │
│ │  Response Sent                                          │ │
│ │  - Content-Type: text/amtp+markdown                    │ │
│ │  - X-AMTP-Version: 1.0                                 │ │
│ │  - Body: Markdown document                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP Response
                            │ Markdown body
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT / AGENT                          │
│  - Parse markdown                                            │
│  - Extract actions                                           │
│  - Execute workflow                                          │
│  - Update session                                            │
└─────────────────────────────────────────────────────────────┘
```

## Request Flow

```
Agent Workflow:
1. AMTPClient.getPage('/products')
   ↓
2. HTTP GET /products
   Header: Accept: text/amtp+markdown
   ↓
3. Content Negotiation checks Accept header
   → Determines: Return AMTP markdown
   ↓
4. Route handler fetches product data
   ↓
5. Response Builder converts to markdown:
   # Product Name
   Price: $99
   [BUY] [ADD_TO_CART]
   ↓
6. HTTP 200 OK
   Content-Type: text/amtp+markdown
   Body: Markdown
   ↓
7. Client parses markdown
   ↓
8. Client discovers actions: [BUY], [ADD_TO_CART]
   ↓
9. Agent decides: Execute BUY action
   ↓
10. AMTPClient.executeAction('buy', {...})
    ↓
11. HTTP POST /api/actions/buy
    Body: { "action": "buy", "parameters": {...} }
    ↓
12. Server executes action (validation, business logic)
    ↓
13. HTTP 201 Created
    Body: { "status": "success", "result": {...} }
    ↓
14. Client updates state, continues workflow
```

## Component Architecture

```
AMTP Protocol Layer
│
├── Request Parser
│   ├── Parse headers
│   ├── Extract capabilities
│   ├── Validate session
│   └── Build request context
│
├── Middleware Stack
│   ├── CORS
│   ├── Compression
│   ├── Content Negotiation
│   ├── Session Validation
│   ├── Rate Limiting
│   └── Error Handling
│
├── Route Handlers
│   ├── GET /resource/* (pages)
│   ├── POST /action/* (actions)
│   ├── POST /form/* (forms)
│   ├── GET /stream/* (streaming)
│   └── POST /session/* (auth)
│
├── Response Builder
│   ├── Markdown Generator
│   ├── Metadata Injector
│   ├── Link Formatter
│   └── Header Builder
│
└── Supporting Services
    ├── Session Manager
    ├── Cache Manager
    ├── Rate Limiter
    ├── Logger
    └── Metrics Collector
```

## Data Flow - Action Execution

```
┌──────────────────────────────────────────────────┐
│ Client                                            │
│ await client.executeAction('buy', params)        │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Request Preparation                               │
│ - Build action request                           │
│ - Add session ID                                 │
│ - Add request ID (idempotency)                   │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ HTTP POST /api/amtp/action                       │
│ Headers: X-Session-ID, Content-Type             │
│ Body: { action, parameters, sessionId }         │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Action Middleware                       │
│ - Validate request format                        │
│ - Check Content-Type                             │
│ - Parse JSON body                                │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Authentication                          │
│ - Load session from X-Session-ID                │
│ - Verify session not expired                     │
│ - Validate user permissions                      │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Authorization                           │
│ - Check action definition                        │
│ - Verify user has permission                     │
│ - Check rate limits                              │
│ - Validate idempotency                           │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Input Validation                        │
│ - Type check parameters                          │
│ - Format validation (email, URL, etc)           │
│ - Range validation (min/max)                     │
│ - Whitelist validation (enums)                   │
│ - Injection prevention                           │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Business Logic                          │
│ - Execute action (buy product)                  │
│ - Check inventory                                │
│ - Process payment                                │
│ - Create order                                   │
│ - Update database                                │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Server - Response Building                       │
│ - Determine result status                        │
│ - Build result object                            │
│ - Identify next actions                          │
│ - Create response JSON                           │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ HTTP Response                                     │
│ 201 Created                                       │
│ {                                                 │
│   status: "success",                              │
│   result: { orderId, total, ... },              │
│   next_actions: ["TRACK", "INVOICE"],           │
│   redirect_to: "/orders/123"                     │
│ }                                                 │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│ Client                                            │
│ - Parse response                                  │
│ - Update state                                    │
│ - Store order ID                                  │
│ - Display success                                 │
│ - Proceed to next step                            │
└──────────────────────────────────────────────────┘
```

## Streaming Architecture

```
SSE (Server-Sent Events):
┌─────────────────────────────────────────────┐
│ Client                                       │
│ const es = new EventSource('/stream/order')  │
│ es.onmessage = (event) => {...}             │
└────────────────┬────────────────────────────┘
                 │
                 │ GET /api/stream/order/ord_123
                 │ Accept: text/event-stream
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Server - Streaming Handler                  │
│ - Open persistent connection                │
│ - Stream order status updates               │
│ - Close on completion or timeout            │
└─────────────────────────────────────────────┘
                 │
                 │ Streaming response:
                 │ event: order_shipped
                 │ data: {...}
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Client                                       │
│ - Receive update                             │
│ - Parse event data                           │
│ - Update UI/state                            │
│ - Handle errors                              │
└─────────────────────────────────────────────┘
```

## Session & State Management

```
┌─────────────────────────────────────────────────────┐
│ Login Request                                        │
│ POST /api/amtp/login                                │
│ { username, password }                              │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ Server                                               │
│ - Validate credentials                              │
│ - Check 2FA if enabled                              │
│ - Generate session ID                               │
│ - Store session in cache/DB                         │
│ - Set expiration (24h)                              │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ Login Response                                       │
│ HTTP 200 OK                                          │
│ {                                                    │
│   sessionId: "sess_abc123",                         │
│   userId: "usr_123",                                │
│   expiresAt: "2024-05-29T...",                      │
│   capabilities: ["read", "write", "checkout"]      │
│ }                                                    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ Client Stores Session                                │
│ sessionId = "sess_abc123"                            │
│ All subsequent requests include:                     │
│ X-Session-ID: sess_abc123                           │
└─────────────────────────────────────────────────────┘
                 │
                 ├── GET /products
                 │   X-Session-ID: sess_abc123
                 │
                 ├── POST /action?action=add_to_cart
                 │   X-Session-ID: sess_abc123
                 │
                 └── GET /stream/cart
                     X-Session-ID: sess_abc123
```

## Caching Strategy

```
┌──────────────────────────────────────────────┐
│ HTTP Response Headers                         │
├──────────────────────────────────────────────┤
│ Cache-Control: public, max-age=3600          │
│ ETag: "abc123"                               │
│ Last-Modified: 2024-05-22T10:30:00Z          │
│ Vary: Accept, X-AMTP-Capabilities           │
└──────────────────┬───────────────────────────┘
                   │
        ┌──────────┴──────────────┐
        │                         │
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│ Browser Cache    │    │ CDN Cache        │
│ 3600 seconds     │    │ 3600 seconds     │
│ Per client       │    │ Shared           │
└──────────────────┘    └──────────────────┘
        │                         │
        └──────────────┬──────────┘
                       │
        ┌──────────────▼──────────────┐
        │ Cache Invalidation          │
        │ POST /action (buy)          │
        │ → Invalidates CDN           │
        │ X-Cache-Invalidate: /path   │
        └─────────────────────────────┘
```

## Design Principles

### 1. **Stateless Where Possible**
- Servers are stateless (except session store)
- Session data stored externally (Redis, DB)
- Enables horizontal scaling

### 2. **Content Negotiation First**
- Same endpoint serves multiple formats
- Client specifies needs via Accept header
- Server responds appropriately

### 3. **HTTP-Native**
- Standard HTTP methods (GET, POST, PUT, DELETE)
- Standard headers (Accept, Content-Type, etc.)
- Standard status codes (200, 400, 500, etc.)
- Compatible with HTTP infrastructure

### 4. **Semantic Structure**
- Markdown is both human and machine readable
- No ambiguity in protocol meaning
- Deterministic parsing

### 5. **Security by Default**
- HTTPS required in production
- Input validation on all fields
- Output escaping for markdown
- Rate limiting per agent
- CSRF protection on forms

### 6. **Extensibility**
- Custom actions per domain
- Custom metadata blocks
- Capability negotiation
- Version upgrades gradual

## Performance Optimizations

### 1. Connection Reuse
- Keep-Alive enabled by default
- Connection pooling for databases
- Persistent session cache

### 2. Compression
- Gzip compression enabled
- Brotli support for modern clients
- Markdown compresses well (~10:1)

### 3. Caching
- HTTP caching directives
- CDN-friendly design
- ETag validation
- Client-side caching

### 4. Streaming
- SSE for long-lived updates
- Chunked transfer for large pages
- WebSocket for bidirectional

### 5. Rate Limiting
- Prevents abuse
- Graceful degradation
- Retry-After headers

---

**AMTP Architecture emphasizes simplicity, scalability, and web compatibility.**
