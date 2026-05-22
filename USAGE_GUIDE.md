# AMTP Usage Guide

Practical walkthrough for running, extending, and integrating with the AMTP protocol toolkit.

---

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0

```bash
git clone <repo-url> && cd AMTP
npm install
```

---

## 1. CLI Reference (`amtp`)

The CLI is run via `ts-node`:

```bash
npm run amtp -- <command> [options]
```

### `amtp init <dir>`
Scaffold a new AMTP project with starter files.

```bash
npm run amtp -- init my-amtp-app
cd my-amtp-app && npm install
```

### `amtp serve`
Start a local AMTP development server.

```bash
npm run amtp -- serve -p 3000 -h 0.0.0.0
```

### `amtp crawl <url>`
Crawl an AMTP-enabled site and dump the index as JSON.

```bash
npm run amtp -- crawl https://example.com --max-pages 20 --max-depth 3
```

### `amtp validate <files...>`
Check markdown files for AMTP structural validity.

```bash
npm run amtp -- validate spec/examples/*.md
```

### `amtp doctor`
Run all health checks — type-check, build, lint, tests, audit, Node version, `.gitignore`, env safety.

```bash
npm run amtp -- doctor
```

### Built-in shorthand scripts

```bash
npm run server        # Start basic-server on :3000
npm run server:saas   # Start SaaS dashboard on :3000
npm run client        # Run basic-client example
npm run crawler       # Run basic-crawler example
npm run bench         # Run performance benchmarks
```

---

## 2. Building an AMTP Server

### Minimal Server

```typescript
// server.ts
import { AMTPServer } from "./src/server/amtp-server";
import { AMTPResponseBuilder } from "./src/server/amtp-server";

const server = new AMTPServer({ port: 3000, enableCORS: true });

server.register("GET", "/", (_req, res) => {
  const doc = new AMTPResponseBuilder().build("# Hello\n\nAMTP world.\n\n## Actions\n\n[GREET] — Say hello");
  const { headers, body } = doc;
  for (const [k, v] of Object.entries(headers)) if (v) res.setHeader(k, v);
  res.send(body);
});

server.start();
```

### Server with Product Page, Actions, Batch & AMTP-QL

A complete example at `src/server/examples/basic-server.ts` includes:

| Route | Purpose |
|---|---|
| `GET /products/:id` | Product page as AMTP document |
| `POST /products/:id/buy` | Action handler with notification emission |
| `POST /api/amtp/batch` | Batch action execution (v1.1) |
| `POST /api/amtp/query` | AMTP-QL query endpoint (v2.0) |
| `POST /api/webhooks` | Register a push webhook |
| `GET /api/amtp/stream` | SSE streaming endpoint |
| `GET /health` | Health check |

```bash
npm run server
```

### SaaS Multi-Tenant Dashboard Server

Located at `src/server/examples/saas-dashboard-server.ts`. Uses SQLite + JWT auth.

```bash
npm run server:saas

# Demo credentials:
#   email:    demo@example.com
#   password: demo-password
```

Endpoints:

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/register` | No | Register tenant + user |
| `POST /api/v1/auth/login` | No | Login, receive JWT |
| `GET /api/v1/me` | JWT | Current user info |
| `GET /api/v1/workspaces` | JWT | List workspaces |
| `POST /api/v1/workspaces` | JWT | Create workspace |
| `GET /amtp/*` | JWT | AMTP content-negotiated workspace list |

```bash
# Get an AMTP document
curl -H "Accept: text/amtp+markdown" \
     -H "Authorization: Bearer <token>" \
     http://localhost:3000/
```

### Using the Middleware Stack Directly

For custom Express apps, compose individual middleware:

```typescript
import express from "express";
import { AMTPMiddlewareFactory } from "./src/server/amtp-server";

const app = express();
const amtp = new AMTPMiddlewareFactory();

app.use(amtp.securityHeaders());
app.use(amtp.cors(["https://myapp.com"]));
app.use(amtp.contentNegotiation());
app.use(amtp.rateLimit(60_000, 100));
app.use(amtp.csrfGuard());
app.use(amtp.middleware());         // parses AMTP headers, resolves session
app.use(amtp.responseSender());    // sends context.response.body
app.use(amtp.errorHandler());       // catch-all error handler
```

### Fastify Adapter

```typescript
import fastify from "fastify";
import { fastifyAMTP, amtpReply } from "./src/server/adapters/fastify-adapter";
import { AMTPResponseBuilder } from "./src/server/amtp-server";

const app = fastify({ logger: true });
amtpReply(app);

await app.register(fastifyAMTP.plugin, {
  trustedOrigins: ["https://example.com"],
});

app.get("/hello", async (_req, reply) => {
  const doc = new AMTPResponseBuilder().build("# Hello\n\nFastify + AMTP");
  return reply.amtp(doc);
});

await app.listen({ port: 3000 });
```

---

## 3. Agent Client SDK

### Basic Usage

```typescript
import { AMTPClient } from "./src/client/amtp-client";

const client = new AMTPClient({
  baseUrl: "http://localhost:3000",
  capabilities: ["actions", "forms", "streaming"],
});

// Fetch a page
const page = await client.getPage("/products/demo");
console.log(page.title);          // "Product demo"
console.log(page.actions);        // [{ id: "buy", ... }, { id: "add_to_cart", ... }]
console.log(page.forms);          // any forms on the page
console.log(page.links);          // navigation links

// Execute an action
const result = await client.executeAction("buy", {
  productId: "demo",
  quantity: 2,
});

// Submit a form (e.g. checkout)
const form = page.forms[0];
await client.submitForm(form, {
  email: "agent@example.com",
  address: "123 AI Street",
});

// Stream real-time updates
const es = client.streamUpdates("/api/amtp/stream", (update) => {
  console.log("🔔", update.type, update.data);
});

// Login / Logout
const { sessionId } = await client.login("user", "pass");
await client.logout();
```

### Autonomous Agent Example

The `AutonomousAgent` class demonstrates an agent that autonomously shops:

```typescript
import { AutonomousAgent } from "./src/client/amtp-client";

const agent = new AutonomousAgent({
  baseUrl: "http://localhost:3000",
});

const result = await agent.autonomousShop("laptop", 2500);
console.log(result.success ? "✅ Purchase completed" : "❌ Failed");
```

The workflow:
1. Search products by keyword
2. Find a product within budget
3. View the product page
4. Execute `add_to_cart` action
5. Navigate to cart
6. Get checkout forms

### AMTP-QL Queries (v2.0)

Project only the fields you need:

```typescript
const result = await client.query(`
  query {
    document {
      title
      actions { id description }
      nodes(type: ["HEADING"], limit: 5) { type content }
      pagination { pageInfo { hasNextPage endCursor } }
    }
  }
`);
console.log(result.title);
console.log(result.actions);
```

---

## 4. Crawler & Search Indexer

### Crawl a Site

```typescript
import { AMTPCrawler } from "./src/crawler/amtp-crawler";

const crawler = new AMTPCrawler({
  baseUrl: "http://localhost:3000",
  maxPages: 100,
  maxDepth: 3,
  respectRobotsTxt: true,
  delays: { betweenRequests: 200, betweenDomains: 1000 },
});

const pages = await crawler.crawl();
console.log(`Crawled ${pages.length} pages`);

// Search the in-memory index
const results = crawler.search("macbook");
console.log(results);

// Export index as JSON
fs.writeFileSync("crawl-index.json", crawler.exportIndex());
```

### Search Indexer

```typescript
import { SearchIndexer } from "./src/crawler/amtp-crawler";

const indexer = new SearchIndexer();
indexer.addPages(pages);

const results = indexer.search("laptop", 10);  // top 10 by relevance
console.log(results.map(r => r.title));
```

---

## 5. AMTP Markdown Format

AMTP documents extend standard markdown with structured blocks:

### Metadata Block
```markdown
```amtp-meta
{
  "pageId": "prod-123",
  "pageType": "product",
  "version": "1.0",
  "sessionRequired": false
}
```
```

### Actions Section
```markdown
## Actions

[BUY] — Purchase immediately
[ADD_TO_CART] — Add to shopping cart
[REVIEW] — Leave a review
```

### Form Definition
```markdown
## Login Form
ACTION: login
METHOD: POST
ENDPOINT: /api/login
FIELD: email
TYPE: email
REQUIRED: true
LABEL: Email Address
FIELD: password
TYPE: password
REQUIRED: true
LABEL: Password
```

### Structured Data
```markdown
```amtp-data
{
  "@type": "Product",
  "name": "MacBook Pro 14",
  "price": 1999,
  "currency": "USD",
  "inStock": true
}
```
```

### Pagination Block
```markdown
```amtp-pagination
{
  "pageInfo": { "hasNextPage": true, "endCursor": "c2" },
  "nextCursor": "c2",
  "totalItems": 42
}
```
```

### Structured Action Definition (v2.0)
Replaces or supplements simple `[ACTION]` tokens with full JSON action metadata including typed parameters and permission requirements:

```markdown
```amtp-action
[
  {
    "id": "delete_doc",
    "label": "Delete Document",
    "method": "POST",
    "endpoint": "/api/docs/delete",
    "permissions": ["doc:delete"],
    "parameters": [
      { "name": "docId", "type": "string", "required": true }
    ]
  }
]
```
```

### Permissions Block (v2.0)
Declares permissions that control access to actions on resources:

```markdown
```amtp-permissions
[
  {
    "id": "doc:read",
    "name": "Read Documents",
    "resource": "doc:*",
    "actions": ["view_doc", "search_docs"]
  },
  {
    "id": "doc:delete",
    "name": "Delete Documents",
    "resource": "doc:*",
    "actions": ["delete_doc"]
  }
]
```
```

### Policy Block (v2.0)
Binds permissions to roles and optional conditions. Policies are evaluated at action-execution time:

```markdown
```amtp-policy
[
  {
    "id": "admin-policy",
    "name": "Admin Access",
    "permissions": ["doc:read", "doc:write", "doc:delete"],
    "roles": ["admin"],
    "priority": 100
  },
  {
    "id": "viewer-policy",
    "name": "Viewer Access",
    "permissions": ["doc:read"],
    "roles": ["viewer"]
  }
]
```
```

Supported condition operators: `eq`, `neq`, `in`, `gt`, `lt`, `contains`, `exists`.

### Skill Block (v2.0)
Bundles actions, permissions, and dependencies into a named capability group:

```markdown
```amtp-skill
[
  {
    "id": "content-manager",
    "name": "Content Management",
    "actions": ["view_doc", "edit_doc", "delete_doc"],
    "permissions": ["doc:read", "doc:write", "doc:delete"],
    "requires": ["login"]
  }
]
```
```

---

## 6. Permission Guard — Policy-Based Access Control

The `PermissionGuard` is a server-side middleware that enforces the permissions and policies declared in AMTP documents at action-execution time.

### How It Works

1. A document declares `permissions` and `policies` as first-class blocks
2. A session holds a flat list of granted permission IDs (e.g. `["doc:read", "doc:delete"]`)
3. The session also has a `role` in its metadata (e.g. `"admin"`, `"viewer"`)
4. When an action is requested, `PermissionGuard.check()` finds matching policies by role, evaluates conditions, and verifies the session has all required permissions

### Usage

```typescript
import { PermissionGuard } from "./src/server/permissions";
import { AMTPError } from "./src/types/amtp.types";

const guard = new PermissionGuard();

// Inside an action handler:
app.post("/api/amtp/action", (req, res) => {
  const action = findAction(req.body.action); // look up the action definition
  const doc = getCurrentDocument();            // the AMTP document context
  const session = req.session;                 // authenticated session with permissions

  try {
    guard.assert(action, doc, session);       // throws AMTPError if denied
    executeAction(action, req.body.parameters);
    res.json({ status: "success" });
  } catch (err) {
    if (err instanceof AMTPError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message }
      });
    }
  }
});
```

### Configuration

```typescript
const guard = new PermissionGuard({
  denyByDefault: true,     // deny actions that have no matching policy (default: false)
  deniedMessage: "Insufficient permissions", // custom error message
});

// Non-throwing check:
const result = guard.check(action, doc, session);
if (result.allowed) {
  console.log(`Matched policy: ${result.matchedPolicy}`);
} else {
  console.log(`Denied: ${result.reason}`);
}
```

### Full Example: Document Management API

```typescript
import { PermissionGuard } from "./src/server/permissions";
import { AMTPServer, AMTPResponseBuilder } from "./src/server/amtp-server";
import type { AMTPDocument, Session } from "./src/types/amtp.types";

const guard = new PermissionGuard();
const server = new AMTPServer({ port: 3000 });

const securedDoc: AMTPDocument = {
  type: "document",
  version: "2.0",
  title: "Document Manager",
  path: "/docs",
  nodes: [],
  actions: [
    { id: "delete_doc", label: "Delete", method: "POST" as any, endpoint: "/api/docs/delete", permissions: ["doc:delete"] },
    { id: "view_doc", label: "View", method: "GET" as any, endpoint: "/api/docs/view", permissions: ["doc:read"] },
  ],
  forms: [],
  links: [],
  metadata: {},
  permissions: [
    { id: "doc:read", name: "Read Documents", resource: "doc:*", actions: ["view_doc"] },
    { id: "doc:delete", name: "Delete Documents", resource: "doc:*", actions: ["delete_doc"] },
  ],
  policies: [
    { id: "admin-policy", name: "Admin", permissions: ["doc:read", "doc:delete"], roles: ["admin"] },
    { id: "viewer-policy", name: "Viewer", permissions: ["doc:read"], roles: ["viewer"] },
  ],
};

server.register("POST", "/api/docs/delete", (req: any, res: any) => {
  const session: Session = req.amtpContext?.session;

  try {
    guard.assert(securedDoc.actions[0], securedDoc, session);
    res.json({ status: "success", deleted: true });
  } catch (err: any) {
    res.status(err.statusCode || 403).json({ error: err.message });
  }
});

server.start();
```

---

## 7. Use Cases

### Use Case 1: E-Commerce Shopping Agent

```typescript
// 1. Server exposes product catalog as AMTP documents
// GET /products/mbp-14 → Markdown with price, specs, actions
// GET /cart → Current cart state
// POST /api/amtp/action → Execute checkout

// 2. Agent workflow
const agent = new AutonomousAgent({ baseUrl: "https://store.example.com" });
const result = await agent.autonomousShop("macbook pro", 3000);

if (result.success) {
  console.log(`Purchased: ${result.product.label}`);
}

// 3. Subscribe to order updates
client.streamUpdates("/api/amtp/stream?events=order.updated,order.shipped", (u) => {
  if (u.type === "order.shipped") {
    console.log(`📦 Tracking: ${u.data.trackingNumber}`);
  }
});
```

### Use Case 2: SaaS Dashboard Agent

```typescript
// 1. Server: src/server/examples/saas-dashboard-server.ts
// 2. Agent logs in and navigates workspaces

import { AMTPClient } from "./src/client/amtp-client";

const client = new AMTPClient({
  baseUrl: "http://localhost:3000",
  capabilities: ["actions", "forms"],
});

// Login
const { token } = await client.login("demo@example.com", "demo-password");

// Fetch AMTP workspace list
const workspaces = await client.getPage("/amtp/workspaces");
console.log(workspaces.title);   // "Workspaces"
console.log(workspaces.links);   // links to each workspace

// Navigate into first workspace
if (workspaces.links.length > 0) {
  const ws = await client.clickLink(workspaces.links[0].url);
  console.log(ws.title);
}
```

### Use Case 3: Content Crawler + Search Engine

```typescript
// Crawl an AMTP-powered documentation site
const crawler = new AMTPCrawler({
  baseUrl: "https://docs.example.com",
  maxPages: 5000,
  maxDepth: 10,
  respectRobotsTxt: true,
  indexCallback: async (doc) => {
    // Index each page to an external search engine
    await fetch("https://search.example.com/index", {
      method: "POST",
      body: JSON.stringify({
        url: doc.path,
        title: doc.title,
        content: doc.nodes.map(n => n.content).join(" "),
        actions: doc.actions.map(a => a.id),
      }),
    });
  },
});

await crawler.crawl();
console.log(crawler.search("authentication"));
```

---

## 8. Performance Benchmarks

```bash
npm run bench
```

Measures:
- Token efficiency (AMTP vs HTML — typically ~90% fewer tokens)
- Parser throughput (ops/sec)
- Large document scaling (10 to 100k sections)
- Memory growth after 20,000 parse operations

---

## 9. Validation & Testing

```bash
# Full validation
npm run validate          # type-check + build + test

# Type check only
npm run type-check

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Security audit
npm run security-audit

# Validate markdown files against AMTP grammar
npm run amtp -- validate spec/examples/*.md
```

---

## 10. Docker

```bash
# Production build
docker compose up amtp-prod

# Development with hot-reload
docker compose up amtp-dev
```

---

## 11. Project Scripts Reference

| npm script | Command | Description |
|---|---|---|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm run dev` | `tsc --watch` | Watch mode compilation |
| `npm run test` | `jest` | Run all tests |
| `npm run test:coverage` | `jest --coverage` | Tests with coverage report |
| `npm run lint` | `eslint src/**/*.ts` | Lint all source |
| `npm run type-check` | `tsc --noEmit` | TypeScript type checking |
| `npm run server` | `ts-node src/server/examples/basic-server.ts` | Start basic demo server |
| `npm run server:saas` | `ts-node src/server/examples/saas-dashboard-server.ts` | Start SaaS dashboard |
| `npm run client` | `ts-node src/client/examples/basic-client.ts` | Run client example |
| `npm run crawler` | `ts-node src/crawler/examples/basic-crawler.ts` | Run crawler example |
| `npm run bench` | `ts-node bench/bench.ts` | Run performance benchmarks |
| `npm run amtp -- <cmd>` | `ts-node bin/amtp.ts <cmd>` | CLI tool |
| `npm run docs` | `typedoc --out docs src/` | Generate API docs |
| `npm run validate` | (type-check + build + test) | Full validation |
| `npm run security-audit` | `npm audit` | Dependency audit |
