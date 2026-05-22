/**
 * AMTP HTTP Integration Tests
 * Spins up an AMTPServer (without listening) and exercises the full HTTP
 * pipeline via supertest: content-negotiation, sessions, CSRF, rate-limiting,
 * CORS, security headers, error handling, AMTP document responses.
 */

import request from "supertest";
import { AMTPServer, AMTPResponseBuilder, ContentNegotiator } from "../../server/amtp-server";
import { MIMEType, MarkdownNodeType, HTTPMethod, StatusCode, ErrorCode } from "../../types/amtp.types";
import type { AMTPDocument } from "../../types/amtp.types";

/* ================================================================
   Helper — create a configured test server with sample routes
   ================================================================ */

function createTestServer(customConfig: Record<string, any> = {}) {
  const server = new AMTPServer({
    enableCORS: true,
    enableRateLimit: false,
    csrfProtection: true,
    enableSecurityHeaders: true,
    ...customConfig,
  });

  const builder = new AMTPResponseBuilder();

  // A route that returns a simple JSON health-check
  server.register("GET", "/health", (_req, res) => {
    res.json({ status: "ok", service: "amtp" });
  });

  // A route that returns an AMTP document (content-negotiation aware)
  server.register("GET", "/product", (req, res) => {
    const preferred = (req as any).preferredMimeType;
    const doc: AMTPDocument = {
      type: "document",
      version: "2.0",
      title: "MacBook Pro",
      path: "/product",
      nodes: [
        { type: MarkdownNodeType.PARAGRAPH, content: "A high-performance laptop." },
      ],
      actions: [
        { id: "buy", label: "BUY", method: HTTPMethod.POST, endpoint: "/buy", description: "Purchase" },
      ],
      forms: [],
      links: [],
      metadata: { sku: "MBP-14" },
    };

    const { body, headers } = builder.build(doc);

    if (preferred === MIMEType.JSON) {
      return res.json(doc);
    }
    if (preferred === MIMEType.AMTP_MARKDOWN) {
      for (const [k, v] of Object.entries(headers)) {
        if (v) res.setHeader(k, v);
      }
      return res.send(body);
    }
    // Default — return HTML wrapper
    res.type(MIMEType.HTML).send(`<html><body><h1>${doc.title}</h1><p>${doc.nodes[0].content}</p></body></html>`);
  });

  // A route that echoes the parsed body (POST)
  server.register("POST", "/echo", (req, res) => {
    res.json({ received: req.body });
  });

  // A route that always throws (tests error handler)
  server.register("GET", "/error", (_req, _res) => {
    throw new Error("Internal failure");
  });

  return server;
}

/* ================================================================
   SUITE: Basic HTTP operations
   ================================================================ */

describe("HTTP — Basic operations", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("GET /health returns JSON status", async () => {
    const res = await app.get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", service: "amtp" });
  });

  it("POST /echo echoes the request body", async () => {
    const res = await app.post("/echo").send({ foo: "bar" }).expect(200);
    expect(res.body).toEqual({ received: { foo: "bar" } });
  });

  it("GET to unknown route returns 404", async () => {
    const res = await app.get("/nonexistent").expect(404);
    // Express default 404 sends HTML — just verify the status code
  });
});

/* ================================================================
   SUITE: Content negotiation
   ================================================================ */

describe("HTTP — Content negotiation", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("returns AMTP markdown when Accept includes text/amtp+markdown", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "text/amtp+markdown")
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/amtp\+markdown/);
    expect(res.text).toContain("# MacBook Pro");
    expect(res.text).toContain("[BUY]");
  });

  it("returns JSON when Accept is application/json", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "application/json")
      .expect(200);
    expect(res.body.title).toBe("MacBook Pro");
    expect(res.body.actions).toHaveLength(1);
  });

  it("returns HTML for a plain browser Accept header", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "text/html")
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("<h1>MacBook Pro</h1>");
  });

  it("returns AMTP when q-value prefers it over HTML", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "text/html;q=0.1, text/amtp+markdown;q=0.9")
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/amtp\+markdown/);
    expect(res.text).toContain("# MacBook Pro");
  });

  it("falls back to HTML for unknown Accept types", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "application/xml")
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
  });
});

/* ================================================================
   SUITE: Security headers
   ================================================================ */

describe("HTTP — Security headers", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("includes X-Content-Type-Options", async () => {
    const res = await app.get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("includes X-Frame-Options", async () => {
    const res = await app.get("/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("includes Content-Security-Policy", async () => {
    const res = await app.get("/health");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });

});

/* ================================================================
   SUITE: CORS headers
   ================================================================ */

describe("HTTP — CORS headers", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("Access-Control-Allow-Origin is * by default", async () => {
    const res = await app.get("/health");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("responds to OPTIONS preflight", async () => {
    const res = await app
      .options("/health")
      .set("Origin", "http://example.com")
      .expect(200);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });
});

/* ================================================================
   SUITE: Session management over HTTP
   ================================================================ */

describe("HTTP — Sessions & CSRF", () => {
  let server: AMTPServer;
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("creates a session and returns a session ID via the session manager", () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-1", "Alice", 3600000);
    expect(session.sessionId).toMatch(/^sess_/);
    expect(session.userId).toBe("user-http-1");
  });

  it("generates a CSRF token bound to the session", () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-2", "Bob", 3600000);
    const token = sm.generateCsrfToken(session.sessionId);
    expect(token).toMatch(/^csrf_/);
    expect(sm.validateCsrfToken(session.sessionId, token)).toBe(true);
  });

  it("denies POST to /echo without CSRF token when a session exists", async () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-3", "Carol", 3600000);

    const res = await app
      .post("/echo")
      .set("x-session-id", session.sessionId)
      .send({ test: true })
      .expect(403);

    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it("allows GET requests without CSRF token even with a session", async () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-4", "Dave", 3600000);

    const res = await app
      .get("/health")
      .set("x-session-id", session.sessionId)
      .expect(200);

    expect(res.body.status).toBe("ok");
  });

  it("allows POST with a valid CSRF token", async () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-5", "Eve", 3600000);
    const token = sm.generateCsrfToken(session.sessionId);

    const res = await app
      .post("/echo")
      .set("x-session-id", session.sessionId)
      .set("x-amtp-csrf-token", token)
      .send({ hello: "world" })
      .expect(200);

    expect(res.body.received.hello).toBe("world");
  });

  it("rejects POST with an invalid CSRF token", async () => {
    const sm = server.getSessionManager();
    const session = sm.createSession("user-http-6", "Frank", 3600000);
    sm.generateCsrfToken(session.sessionId); // real token generated but not used

    const res = await app
      .post("/echo")
      .set("x-session-id", session.sessionId)
      .set("x-amtp-csrf-token", "csrf_fake_token")
      .send({ should: "fail" })
      .expect(403);

    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it("POST without a session ID passes through CSRF guard", async () => {
    const res = await app
      .post("/echo")
      .send({ no: "session" })
      .expect(200);

    expect(res.body.received.no).toBe("session");
  });
});

/* ================================================================
   SUITE: Rate limiting
   ================================================================ */

describe("HTTP — Rate limiting", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    // Create a server with aggressive rate limiting
    const server = createTestServer({
      enableRateLimit: true,
      rateLimit: { windowMs: 60_000, maxRequests: 3 },
    });
    app = request(server.getConfiguredApp());
  });

  it("allows requests within the limit", async () => {
    const res = await app.get("/health").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns 429 when exceeding the rate limit", async () => {
    const makeRequest = () =>
      app.get("/health").expect((res: any) => {
        if (res.status === 429) return true;
        return res.status === 200;
      });

    // Exhaust the 3-request window
    await makeRequest();
    await makeRequest();
    await makeRequest();

    // 4th request should be rate-limited
    const res = await app.get("/health").expect(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(res.headers["retry-after"]).toBeDefined();
  });
});

/* ================================================================
   SUITE: Error handling
   ================================================================ */

describe("HTTP — Error handling", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("returns JSON error for internal server errors", async () => {
    const res = await app.get("/error").expect(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error.code).toBe(ErrorCode.SERVER_ERROR);
    expect(res.body.error.message).toBe("Internal server error");
  });
});

/* ================================================================
   SUITE: AMTP document serialization across HTTP
   ================================================================ */

describe("HTTP — AMTP document response", () => {
  let app: ReturnType<typeof request>;

  beforeAll(() => {
    const server = createTestServer();
    app = request(server.getConfiguredApp());
  });

  it("returns a complete AMTP markdown document with metadata block", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "text/amtp+markdown")
      .expect(200);

    expect(res.text).toContain("# MacBook Pro");
    expect(res.text).toContain("amtp-meta");
    expect(res.text).toContain("MBP-14");
    expect(res.text).toContain("[BUY]");
  });

  it("includes version header in response", async () => {
    const res = await app
      .get("/product")
      .set("Accept", "text/amtp+markdown");

    expect(res.headers["x-amtp-version"]).toBe("1.0");
  });
});

/* ================================================================
   SUITE: Custom configuration — trusted origins
   ================================================================ */

describe("HTTP — Trusted origins CORS", () => {
  it("rejects requests from untrusted origins when trustedOrigins is set", async () => {
    const server = new AMTPServer({
      enableCORS: true,
      trustedOrigins: ["https://trusted.example.com"],
      enableRateLimit: false,
    });
    server.register("GET", "/data", (_req, res) => {
      res.json({ ok: true });
    });
    const app = request(server.getConfiguredApp());

    const res = await app
      .get("/data")
      .set("Origin", "https://evil.com")
      .expect(403);
    expect(res.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it("allows requests from trusted origins", async () => {
    const server = new AMTPServer({
      enableCORS: true,
      trustedOrigins: ["https://trusted.example.com"],
      enableRateLimit: false,
    });
    server.register("GET", "/data", (_req, res) => {
      res.json({ ok: true });
    });
    const app = request(server.getConfiguredApp());

    const res = await app
      .get("/data")
      .set("Origin", "https://trusted.example.com")
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});
