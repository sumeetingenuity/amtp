# AMTP: Agent Markdown Transfer Protocol

**HTTP for the Agentic Web**

A production-grade, markdown-first protocol for AI agents and headless browsers to interact with web services without requiring DOM rendering, CSS engines, or JavaScript execution.

## 🎯 Vision

Enable AI agents to browse the web efficiently by providing:

- **Semantic Markdown** instead of HTML
- **Deterministic Structure** for machine parsing
- **Token Efficiency** for LLM consumption
- **Hypermedia Navigation** built-in
- **Streaming Updates** in real-time
- **Session Awareness** for stateful workflows
- **Action-First Design** with zero DOM clicks

## ⚡ Quick Start

### Installation

```bash
npm install @amtp/protocol
```

### Using the Agent Client

```typescript
import { AMTPClient } from "@amtp/protocol";

const client = new AMTPClient({
  baseUrl: "https://example.com",
  capabilities: ["actions", "streaming", "forms"],
});

// Fetch a page
const page = await client.getPage("/products/mbp-14");
console.log(page.title); // "MacBook Pro 14""

// Execute an action
const result = await client.executeAction("buy", {
  productId: "mbp-14",
  quantity: 1,
  paymentMethod: "credit_card",
});

// Submit a form
await client.submitForm(checkoutForm, {
  email: "user@example.com",
  address: "123 Main St",
});

// Stream real-time updates
client.streamUpdates("/api/stream/order", (update) => {
  console.log("Order status:", update);
});
```

### Building an AMTP Server

```typescript
import { AMTPServer } from "@amtp/protocol";

const server = new AMTPServer({
  port: 3000,
  enableCORS: true,
  enableCompression: true,
});

server.register("GET", "/products/:id", async (req, res) => {
  const productId = req.params.id;
  const product = await fetchProduct(productId);

  const amtpDoc = {
    type: "document",
    title: product.name,
    actions: [
      { id: "buy", label: "BUY", method: "POST", endpoint: "/api/buy" },
    ],
    links: [
      { text: "Reviews", url: `/products/${productId}/reviews` },
    ],
  };

  res.json(amtpDoc);
});

server.start();
```

### Authenticated Agents (Website Chatbot)

For website chatbots and agents that act on behalf of logged-in users, AMTP
auto-bridges your existing web auth — no separate token ceremony for end users.

```typescript
import { AMTPServer, WebSessionAdapter, SessionManager } from "@amtp/protocol";

const server = new AMTPServer({ port: 3000 });

const adapter = new WebSessionAdapter({
  sessionManager: server.getSessionManager(),
  resolveUser: (req) => {
    // req.user is populated by Passport, Express session, JWT, etc.
    if (!req.user) return null;
    return {
      id: req.user.id,
      username: req.user.displayName,
      role: req.user.role,
      // Only fields you project here reach the agent — never raw secrets
    };
  },
});

// Mount AFTER your auth middleware (Passport, session, etc.)
server.useWebSession(adapter);

server.register("POST", "/api/orders", (req, res) => {
  const session = (req as any).amtpContext?.session;
  // session.userId is the authenticated user —
  // no token config needed from the end user
  res.json({ userId: session.userId });
});

server.start();
```

### Crawling AMTP Sites

```typescript
import { AMTPCrawler } from "@amtp/protocol";

const crawler = new AMTPCrawler({
  baseUrl: "https://example.com",
  maxPages: 10000,
  maxDepth: 5,
});

const pages = await crawler.crawl();
console.log(`Crawled ${pages.length} pages`);

// Search the index
const results = crawler.search("macbook pro");
```

## 📚 Documentation

### Core Specifications
- [**AMTP RFC** - Full Protocol Specification](./spec/AMTP-RFC.md)
- [**Markdown Grammar** - Formal EBNF Grammar](./spec/MARKDOWN-GRAMMAR.md)
- [**Advanced Features** - Sessions, Streaming, Security](./spec/ADVANCED-FEATURES.md)

### Implementations
- [**Server Implementation** - Express middleware & server](./src/server/)
- [**Client SDK** - Agent client library](./src/client/)
- [**Crawler** - Website crawler & indexer](./src/crawler/)

### Examples & Reference
- [**Real-World Examples** - E-commerce, SaaS, search](./reference-implementations/EXAMPLES.md)
- [**TypeScript Types** - Protocol type definitions](./src/types/amtp.types.ts)

## 🏗️ Project Structure

```
AMTP/
├── spec/
│   ├── AMTP-RFC.md                 # Full RFC specification
│   ├── MARKDOWN-GRAMMAR.md         # Markdown grammar & parsing
│   ├── ADVANCED-FEATURES.md        # Sessions, streaming, security
│   └── protocols/                  # Protocol versions
├── src/
│   ├── types/
│   │   └── amtp.types.ts           # TypeScript type definitions
│   ├── server/
│   │   ├── amtp-server.ts          # Express server & middleware
│   │   ├── web-session-adapter.ts  # Web auth → AMTP session bridge
│   │   └── markdown-parser.ts      # AMTP markdown parser
│   ├── client/
│   │   └── amtp-client.ts          # Agent client SDK
│   └── crawler/
│       └── amtp-crawler.ts         # Website crawler & indexer
├── reference/
│   ├── server/                     # Runnable demo server (for developers)
│   └── client/                     # Runnable demo client (for developers)
├── reference-implementations/
│   └── EXAMPLES.md                 # Real-world examples
├── docs/                           # Additional documentation
└── README.md                       # This file
```

## 🎨 Key Concepts

### 1. Markdown-First

Pages are semantic markdown, not HTML:

```markdown
# MacBook Pro 14"

Price: $1,999
In Stock: Yes

## Actions

[BUY] [ADD_TO_CART] [SAVE_FOR_LATER]

## Specifications

| Component | Spec |
|-----------|------|
| CPU | M3 Pro |
| RAM | 18GB |
```

### 2. Action-Native

Semantic actions instead of DOM clicks:

```json
{
  "action": "buy",
  "parameters": {
    "productId": "mbp-14",
    "quantity": 1,
    "paymentMethod": "credit_card"
  }
}
```

### 3. Content Negotiation

Same URL serves multiple formats:

```http
GET /products/mbp-14
Accept: text/amtp+markdown → Markdown response (for agents)
Accept: text/html → HTML response (for browsers)
Accept: application/json → JSON API response (for clients)
```

### 4. Session-Aware

Sessions persist state across requests:

```http
X-Session-ID: sess_abc123
→ Maintains cart, auth, preferences, workflow state
```

### 5. Streaming Support

Real-time updates via SSE, WebSocket, or HTTP streams:

```
GET /api/stream/order/ord_123
→ Streams: order_shipped, out_for_delivery, delivered, etc.
```

## 🔐 Security

AMTP includes built-in security features:

- **Input Validation** - Type, format, range, injection prevention
- **Authentication** - Session tokens, JWT, Bearer tokens, API keys
- **Auto-Session Bridge** - Derives AMTP sessions from existing web auth; raw `req.user` is never exposed to agents/LLMs
- **Authorization** - Permission-based action execution
- **CSRF Protection** - Token-based protection
- **Rate Limiting** - Per-agent, per-action rate limits
- **Encryption** - HTTPS only, encrypted sensitive data

## 📊 Performance

AMTP optimizes for:

- **Low Latency** - No DOM rendering, direct semantic response
- **Token Efficiency** - ~90% less tokens than HTML for LLMs
- **Network Efficiency** - Gzip compression, chunked transfer
- **Cacheability** - Standard HTTP caching headers
- **Scalability** - Stateless servers, horizontal scaling

Typical Response Times:
- Product page: 50-100ms
- Form submission: 200-500ms
- Checkout flow: 1-3 seconds

## 🤖 Agent Capabilities

Agents can declare capabilities:

```http
X-AMTP-Capabilities: actions,streaming,forms,tools,pagination,multimodal
```

Server adapts response:
- ✅ Actions: Always available
- ✅ Streaming: SSE, WebSocket, HTTP streams
- ✅ Forms: Complex field types and validation
- ✅ Tools: External API integration
- ✅ Pagination: Cursor, offset, infinite scroll
- ✅ Multimodal: Images, videos, documents

## 📈 Roadmap

### v1.0 (Current)
- ✅ Core protocol
- ✅ Markdown grammar
- ✅ Action system
- ✅ Forms & navigation
- ✅ Session management
- ✅ Basic streaming
- ✅ Type definitions
- ✅ Reference implementations

### v1.1 (Q3 2024)
- [ ] Multimedia support
- [ ] Natural language descriptions
- [ ] Advanced filtering
- [ ] Batch operations

### v2.0 (Q4 2024)
- [ ] Multi-agent coordination
- [ ] Distributed sessions
- [ ] Advanced caching
- [ ] Webhook support

### v3.0 (Q1 2025)
- [ ] Voice interface
- [ ] Mobile optimization
- [ ] Blockchain integration
- [ ] Federated identity

## 🔗 Comparisons

| Aspect | HTML | JSON API | GraphQL | AMTP |
|--------|------|----------|---------|------|
| **Machine-Readable** | ❌ | ✅ | ✅ | ✅ |
| **Navigation Built-in** | ✅ | ❌ | ❌ | ✅ |
| **Hypermedia** | ✅ | ❌ | ❌ | ✅ |
| **LLM-Friendly** | ❌ | ⚠️ | ⚠️ | ✅ |
| **Token Efficient** | ❌ | ⚠️ | ⚠️ | ✅ |
| **Low Latency** | ❌ | ✅ | ⚠️ | ✅ |
| **Cacheable** | ✅ | ✅ | ❌ | ✅ |
| **Browser Compatible** | ✅ | ❌ | ❌ | ✅* |

*Via content negotiation

## 🚀 Getting Started

### For Server Developers

```bash
# 1. Install SDK
npm install @amtp/protocol

# 2. Follow server implementation guide
# See: src/server/amtp-server.ts

# 3. Register routes
# See: reference-implementations/EXAMPLES.md

# 4. Deploy with Express
npm start
```

### For Agent Developers

```bash
# 1. Install SDK
npm install @amtp/protocol

# 2. Create client
const client = new AMTPClient({ baseUrl: "..." });

# 3. Build workflows
# See: src/client/amtp-client.ts

# 4. Run agent
npm run agent
```

### For Search/Crawlers

```bash
# 1. Build crawler
const crawler = new AMTPCrawler({ baseUrl: "..." });

# 2. Crawl website
await crawler.crawl();

# 3. Index results
# See: src/crawler/amtp-crawler.ts
```

## 📝 License

MIT License - See LICENSE file

## 🤝 Contributing

Contributions welcome! Please:

1. Review the RFC specification
2. Check existing implementations
3. Follow TypeScript conventions
4. Add tests for new features
5. Submit pull request with description

## 📧 Contact

Questions or ideas? Open an issue or discussion.

---

**AMTP is the protocol for the agentic web.**

*Designed for AI agents, built on web standards, compatible with everything.*

### Stay Updated

- ⭐ Star this repository
- 🔔 Watch for releases
- 💬 Join discussions
- 📮 Subscribe to updates

---

**Made with ❤️ for the future of agent-web interactions**
