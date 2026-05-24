/**
 * Basic AMTP Server Example
 *
 * Run with: npm run server
 */

import { AMTPServer } from "../amtp-server.js";
import { AMTPDocument, MarkdownNodeType, LinkType, HTTPMethod } from "../../types/amtp.types.js";

const server = new AMTPServer({
  port: parseInt(process.env.PORT || "3000", 10),
  host: "0.0.0.0",
  enableCORS: true,
  enableCompression: true,
  enableRateLimit: true,
});

// Register a simple product page
server.register("GET", "/products/:id", (req: any, res: any) => {
  const { id } = req.params;
  const doc: AMTPDocument = {
    type: "document",
    version: "1.0",
    title: `Product ${id}`,
    path: `/products/${id}`,
    nodes: [
      { type: MarkdownNodeType.PARAGRAPH, content: `This is the AMTP representation of product ${id}.` },
      { type: MarkdownNodeType.PARAGRAPH, content: "Details: Price $99.99 In stock Yes" },
    ],
    actions: [
      { id: "BUY", label: "Buy Now", method: HTTPMethod.POST, endpoint: `/products/${id}/buy` },
      { id: "ADD_TO_CART", label: "Add to Cart", method: HTTPMethod.POST, endpoint: `/products/${id}/cart` },
    ],
    links: [
      { text: "Reviews", url: `/products/${id}/reviews`, type: LinkType.INTERNAL },
      { text: "Related", url: "/products/related", type: LinkType.INTERNAL },
    ],
    metadata: { productId: id },
    forms: [],
    structured_data: [],
  };
  res.json(doc);
});

// Simple action handler
server.register("POST", "/products/:id/buy", (req: any, res: any) => {
  const { id } = req.params;
  const { quantity = 1 } = req.body || {};
  const doc: AMTPDocument = {
    type: "document",
    version: "1.0",
    title: "Purchase Complete",
    path: `/products/${id}/buy`,
    nodes: [
      { type: MarkdownNodeType.PARAGRAPH, content: `Thank you! Purchased ${quantity} of product ${id}.` },
    ],
    actions: [],
    links: [{ text: "Back to product", url: `/products/${id}`, type: LinkType.INTERNAL }],
    metadata: {},
    forms: [],
    structured_data: [],
  };

  // v2.0: Emit live notification (picked up by SSE and webhooks)
  notificationBus.emitEvent({
    id: `evt_${Date.now()}`,
    type: "order.updated",
    timestamp: new Date().toISOString(),
    data: { productId: id, quantity, status: "purchased" },
  });

  res.status(201).json(doc);
});

// Batch action handler (v1.1 stub)
server.register("POST", "/api/amtp/batch", (req: any, res: any) => {
  const body = req.body || {};
  const results = (body.actions || []).map((item: any, idx: number) => ({
    actionId: item.action,
    requestId: item.requestId || `req_${idx}`,
    status: "success" as const,
    result: { processed: true, batch: true, echo: item.parameters || {} },
  }));

  const response = {
    batchId: body.batchId || `batch_${Date.now()}`,
    status: "success" as const,
    results,
  };

  res.json(response);
});

// AMTP-QL endpoint (v2.0) — query the document with a tiny GraphQL-like language
server.register("POST", "/api/amtp/query", async (req: any, res: any) => {
  const body = (req.body || {}) as { query: string; variables?: Record<string, unknown> };

  // Demo document rich enough to exercise all AMTP-QL projections
  const demoDoc: AMTPDocument = {
    type: "document",
    version: "2.0",
    title: "AMTP-QL Demo Product",
    path: "/demo/ql",
    nodes: [
      { type: MarkdownNodeType.HEADING, content: "Overview" },
      { type: MarkdownNodeType.PARAGRAPH, content: "This is a demonstration document for AMTP-QL." },
      { type: MarkdownNodeType.PARAGRAPH, content: "It contains actions, forms, structured data and pagination." },
    ],
    actions: [
      { id: "BUY", label: "Buy", method: HTTPMethod.POST, endpoint: "/demo/buy", description: "Purchase item" },
      { id: "WISHLIST", label: "Add to Wishlist", method: HTTPMethod.POST, endpoint: "/demo/wishlist" },
    ],
    forms: [
      { id: "review", action: "/demo/review", method: HTTPMethod.POST, endpoint: "/demo/review", fields: [
        { name: "rating", type: "number" as any, required: true },
        { name: "comment", type: "string" as any },
      ]},
    ],
    links: [
      { text: "Docs", url: "/docs", type: LinkType.EXTERNAL },
    ],
    metadata: { pageType: "product", category: "demo" },
    structured_data: [
      { "@type": "Product", data: { price: 199, currency: "USD", inStock: true } },
    ],
    pagination: {
      pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: "c1", endCursor: "c2" },
      nextCursor: "c2",
      itemsPerPage: 10,
      totalItems: 42,
    },
  };

  const result = await server.handleAMTPQL(body, () => demoDoc);
  res.json(result);
});

// =====================================================
// v2.0: Webhook + SSE Push Notifications
// =====================================================
import { notificationBus } from "../notifications";
import { NotificationEventType } from "../../types/amtp.types";

// Register a webhook (agent provides URL to receive POSTs)
server.register("POST", "/api/webhooks", (req: any, res: any) => {
  const { url, events, secret, description } = req.body || {};
  if (!url || !events?.length) {
    return res.status(400).json({ error: "url and events are required" });
  }

  const sub = notificationBus.registerWebhook({
    url,
    events,
    secret,
    description,
  });

  res.status(201).json({
    subscription: sub,
    testCommand: `curl -X POST ${url} -H "Content-Type: application/json" -d '{"type":"test"}'`,
  });
});

// List webhooks
server.register("GET", "/api/webhooks", (_req: any, res: any) => {
  res.json({ webhooks: notificationBus.listWebhooks() });
});

// Delete webhook
server.register("DELETE", "/api/webhooks/:id", (req: any, res: any) => {
  const ok = notificationBus.deleteWebhook(req.params.id);
  res.json({ deleted: ok });
});

// SSE Stream - agents connect here for live updates
// Example: GET /api/amtp/stream?events=order.updated,workspace.updated
server.register("GET", "/api/amtp/stream", (req: any, res: any) => {
  const requestedEvents = (req.query.events || "").split(",").filter(Boolean);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering

  const sendEvent = (event: any) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = notificationBus.subscribeSSE(
    requestedEvents.length ? requestedEvents : Object.values(NotificationEventType),
    sendEvent
  );

  // Send initial heartbeat
  res.write(`: connected\n\n`);

  req.on("close", () => {
    unsubscribe();
  });
});

// Demo: emit a notification when a buy happens (in the buy handler above, we can call this)
// For demo, expose an endpoint to manually emit
server.register("POST", "/api/demo/emit", (req: any, res: any) => {
  const { type, data } = req.body || {};
  const event = {
    id: `evt_${Date.now()}`,
    type: type || "order.updated",
    timestamp: new Date().toISOString(),
    data: data || { demo: true },
  };
  notificationBus.emitEvent(event);
  res.json({ emitted: event });
});

// =====================================================
// v1.1: OAuth 2.0 delegation demo
// =====================================================

// Protected route — requires "orders:read" OAuth scope
server.register("GET", "/api/protected/orders", (req: any, res: any) => {
  const session = (req as any).amtpContext?.session;

  const doc: AMTPDocument = {
    type: "document",
    version: "1.0",
    title: "My Orders",
    path: "/api/protected/orders",
    nodes: [
      { type: MarkdownNodeType.PARAGRAPH, content: `Orders for user: ${session?.userId || "unknown"}` },
    ],
    actions: [
      {
        id: "VIEW_ORDER",
        label: "VIEW_ORDER",
        method: HTTPMethod.POST,
        endpoint: "/api/protected/orders/view",
        requiresAuthentication: true,
        authScope: "orders:read",
      },
    ],
    links: [],
    metadata: {},
    forms: [],
    structured_data: [],
    // Advertise OAuth provider so agents can request delegated tokens
    auth: {
      provider: "example",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["orders:read", "orders:write"],
      pkce: true,
      introspectionUrl: "/amtp/auth/introspect",
    },
  };

  res.json(doc);
});

// Health
server.register("GET", "/health", (_req: any, res: any) => {
  res.json({ status: "ok", protocol: "AMTP", version: "1.0" });
});

// Home
server.register("GET", "/", (_req: any, res: any) => {
  const doc: AMTPDocument = {
    type: "document",
    version: "1.0",
    title: "AMTP Basic Server",
    path: "/",
    nodes: [
      { type: MarkdownNodeType.PARAGRAPH, content: "Welcome to the basic AMTP reference server." },
      { type: MarkdownNodeType.PARAGRAPH, content: "Try: GET /products/demo with Accept: text/amtp+markdown" },
    ],
    actions: [],
    links: [{ text: "Product Demo", url: "/products/demo", type: LinkType.INTERNAL }],
    metadata: {},
    forms: [],
    structured_data: [],
  };
  res.json(doc);
});

server.start().catch(console.error);

console.log("Basic AMTP server example starting...");
