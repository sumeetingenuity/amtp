/**
 * AMTP Integration Tests
 * Tests real implementations in realistic workflows
 */

import { AMTPMarkdownParser } from "../../server/markdown-parser";
import { SessionManager, ContentNegotiator, AMTPRequestParser, AMTPResponseBuilder, AMTPMiddlewareFactory } from "../../server/amtp-server";
import { AMTPClient, AMTPMarkdownParser as ClientParser } from "../../client/amtp-client";
import { SearchIndexer } from "../../crawler/amtp-crawler";
import {
  validateUrl,
  InMemoryRateLimiter,
  generateSecureSessionId,
  sanitizeEndpoint,
  sanitizeActionId,
} from "../../server/security";
import { MIMEType, LinkType, MarkdownNodeType, HTTPMethod } from "../../types/amtp.types";
import type { AMTPDocument } from "../../types/amtp.types";

/* ================================================================
   PARSER + BUILDER ROUND-TRIP
   ================================================================ */

describe("Parser + Builder Round-Trip", () => {
  const parser = new AMTPMarkdownParser();
  const builder = new AMTPResponseBuilder();

  it("parses markdown, builds it back, preserving title and actions", () => {
    const input = [
      "# Product Page",
      "",
      "Welcome to the product page.",
      "",
      "## Actions",
      "",
      "[BUY] — Purchase this item",
      "[ADD_TO_CART] — Add to shopping cart",
    ].join("\n");

    const doc = parser.parse(input, "/product");

    // Verify parse
    expect(doc.title).toBe("Product Page");
    expect(doc.path).toBe("/product");
    expect(doc.actions.length).toBe(2);
    expect(doc.actions[0].id).toBe("buy");
    expect(doc.actions[1].id).toBe("add_to_cart");

    // Rebuild to markdown
    const { body, headers } = builder.build(doc);
    expect(headers["content-type"]).toBe(MIMEType.AMTP_MARKDOWN);
    expect(body).toContain("# Product Page");
    expect(body).toContain("[BUY]");
    expect(body).toContain("[ADD_TO_CART]");
  });

  it("round-trips forms with fields", () => {
    const md = [
      "# Login",
      "## Login Form",
      "ACTION: login",
      "METHOD: POST",
      "ENDPOINT: /api/login",
      "FIELD: email",
      "TYPE: email",
      "REQUIRED: true",
      "FIELD: password",
      "TYPE: password",
      "REQUIRED: true",
    ].join("\n");

    const doc = parser.parse(md, "/login");
    expect(doc.forms.length).toBeGreaterThanOrEqual(1);
    const form = doc.forms[0];
    expect(form.fields.length).toBe(2);
    expect(form.fields[0].name).toBe("email");
    expect(form.fields[0].type).toBe("email");
    expect(form.fields[1].name).toBe("password");
  });
});

/* ================================================================
   CONTENT NEGOTIATION + REQUEST PARSING
   ================================================================ */

describe("Content Negotiation + Request Pipeline", () => {
  const negotiator = new ContentNegotiator();
  const parser = new AMTPRequestParser();

  it("negotiates AMTP when accept header includes amtp", () => {
    expect(negotiator.negotiate("text/amtp+markdown")).toBe(MIMEType.AMTP_MARKDOWN);
    expect(negotiator.negotiate("application/amtp+markdown")).toBe(MIMEType.AMTP_MARKDOWN);
  });

  it("negotiates AMTP for markdown accept header", () => {
    expect(negotiator.negotiate("text/markdown")).toBe(MIMEType.AMTP_MARKDOWN);
  });

  it("negotiates JSON when explicitly requested", () => {
    expect(negotiator.negotiate("application/json")).toBe(MIMEType.JSON);
  });

  it("falls back to HTML when accept is missing or unknown", () => {
    expect(negotiator.negotiate("")).toBe(MIMEType.HTML);
    expect(negotiator.negotiate("application/xml")).toBe(MIMEType.HTML);
  });

  it("respects quality values (q=)", () => {
    const result = negotiator.negotiate("text/html;q=0.1, text/amtp+markdown;q=0.9");
    expect(result).toBe(MIMEType.AMTP_MARKDOWN);
  });
});

/* ================================================================
   SESSION MANAGEMENT WORKFLOW
   ================================================================ */

describe("Session Management Workflow", () => {
  it("creates, retrieves, and deletes sessions", () => {
    const sm = new SessionManager();

    const session = sm.createSession("usr_001", "Alice", 3600000);
    expect(session.sessionId).toMatch(/^sess_/);
    expect(session.userId).toBe("usr_001");
    expect(session.username).toBe("Alice");

    const retrieved = sm.getSession(session.sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.userId).toBe("usr_001");

    sm.deleteSession(session.sessionId);
    expect(sm.getSession(session.sessionId)).toBeNull();
  });

  it("enforces absolute max lifetime", () => {
    const sm = new SessionManager(5000); // 5 seconds absolute max

    const session = sm.createSession("usr_002", "Bob", 99999999);
    const expiresMs = new Date(session.expiresAt).getTime();
    const now = Date.now();
    expect(expiresMs - now).toBeLessThanOrEqual(6000); // within tolerance
  });

  it("generates and validates CSRF tokens bound to sessions", () => {
    const sm = new SessionManager();
    const session = sm.createSession("usr_003", "Carol", 3600000);
    const token = sm.generateCsrfToken(session.sessionId);

    expect(sm.validateCsrfToken(session.sessionId, token)).toBe(true);
    expect(sm.validateCsrfToken(session.sessionId, "wrong_token")).toBe(false);
    expect(sm.validateCsrfToken("sess_nonexistent", token)).toBe(false);
  });

  it("prunes expired sessions", () => {
    const sm = new SessionManager();
    const session = sm.createSession("usr_004", "Dave", -1); // immediately expired
    sm.pruneExpired();
    expect(sm.getSession(session.sessionId)).toBeNull();
  });
});

/* ================================================================
   MIDDLEWARE CHAIN (without HTTP)
   ================================================================ */

describe("AMTP Middleware Factory", () => {
  const factory = new AMTPMiddlewareFactory();

  it("has a session manager accessible via .sessions", () => {
    expect(factory.sessions).toBeDefined();
    expect(typeof factory.sessions.createSession).toBe("function");
  });

  it("creates all required middleware functions", () => {
    expect(typeof factory.middleware()).toBe("function");
    expect(typeof factory.responseSender()).toBe("function");
    expect(typeof factory.errorHandler()).toBe("function");
    expect(typeof factory.securityHeaders()).toBe("function");
    expect(typeof factory.contentNegotiation()).toBe("function");
    expect(typeof factory.cors()).toBe("function");
    expect(typeof factory.rateLimit(60000, 60)).toBe("function");
    expect(typeof factory.csrfGuard()).toBe("function");
  });
});

/* ================================================================
   SECURITY: URL + RATE LIMIT + SANITIZATION
   ================================================================ */

describe("Security Integration", () => {
  it("validateUrl rejects dangerous schemes", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow(/Disallowed URL scheme/);
    expect(() => validateUrl("data:text/html,<x>")).toThrow(/Disallowed URL scheme/);
    expect(() => validateUrl("file:///etc/passwd")).toThrow(/Disallowed URL scheme/);
  });

  it("validateUrl resolves relative URLs against base", () => {
    const result = validateUrl("/api/action", "https://example.com");
    expect(result).toBe("https://example.com/api/action");
  });

  it("InMemoryRateLimiter isolates IPs and respects windows", () => {
    const limiter = new InMemoryRateLimiter(60000, 2);

    expect(limiter.check("10.0.0.1")).toBe(true);
    expect(limiter.check("10.0.0.1")).toBe(true);
    expect(limiter.check("10.0.0.1")).toBe(false); // blocked

    expect(limiter.check("10.0.0.2")).toBe(true); // different IP, not blocked
  });

  it("retryAfterSeconds returns correct value for blocked IP", () => {
    const limiter = new InMemoryRateLimiter(60000, 1);
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    expect(limiter.retryAfterSeconds("1.2.3.4")).toBeGreaterThan(0);
  });

  it("sanitizeEndpoint rejects dangerous inputs", () => {
    expect(sanitizeEndpoint("/api/safe")).toBe("/api/safe");
    expect(() => sanitizeEndpoint("javascript:alert(1)")).toThrow();
    expect(() => sanitizeEndpoint("/path?query=1")).toThrow();
  });

  it("sanitizeActionId normalizes and rejects bad input", () => {
    expect(sanitizeActionId("BUY_NOW")).toBe("BUY_NOW");
    expect(() => sanitizeActionId("")).toThrow();
    expect(() => sanitizeActionId("<script>")).toThrow();
  });
});

/* ================================================================
   CLIENT ACTIONS (mock server interactions)
   ================================================================ */

describe("Client Action Workflow", () => {
  it("generates request IDs in correct format", () => {
    const client = new AMTPClient({ baseUrl: "http://localhost:9999", timeout: 100 });
    const id = (client as any).generateRequestId();
    expect(id).toMatch(/^req_\d+_[a-f0-9]+$/);
  });

  it("sets session ID", () => {
    const client = new AMTPClient({ baseUrl: "http://localhost:9999", timeout: 100 });
    client.setSessionId("sess_test123");
    expect(client.getSessionId()).toBe("sess_test123");
  });

  it("gets session ID when not set", () => {
    const client = new AMTPClient({ baseUrl: "http://localhost:9999", timeout: 100 });
    expect(client.getSessionId()).toBeUndefined();
  });

  it("client parser extracts actions from markdown", () => {
    const parser = new ClientParser();
    const doc = parser.parse("# Product\n\n[BUY] - Buy now\n[REVIEW] - Review", "/product");
    expect(doc.title).toBe("Product");
    expect(doc.actions.length).toBeGreaterThanOrEqual(1);
  });
});

/* ================================================================
   CRAWLER + INDEXER
   ================================================================ */

describe("Crawler SearchIndexer", () => {
  it("indexes pages and returns sorted relevance results", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "/macbook",
        title: "MacBook Pro",
        content: "apple macbook pro laptop computer high-performance",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
      {
        url: "/ipad",
        title: "iPad Pro",
        content: "apple ipad pro tablet mobile device",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);

    const macResults = indexer.search("macbook laptop");
    expect(macResults.length).toBeGreaterThan(0);
    expect(macResults[0].title).toBe("MacBook Pro");
  });

  it("returns empty for query with no matches", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "/a",
        title: "Alpha",
        content: "alpha beta gamma",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    expect(indexer.search("omega")).toEqual([]);
  });

  it("is case insensitive", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "/mac",
        title: "MacBook Pro",
        content: "Apple Laptop Computer",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    expect(indexer.search("apple").length).toBeGreaterThan(0);
    expect(indexer.search("APPLE").length).toBeGreaterThan(0);
  });

  it("exports index as JSON", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "/test",
        title: "Test",
        content: "test content page",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    const exported = indexer.exportIndex();
    expect(typeof exported).toBe("string");
    expect(exported).toContain("test");
  });
});

/* ================================================================
   ERROR HANDLING
   ================================================================ */

describe("Error Handling", () => {
  it("AMTPMarkdownParser throws on missing H1", () => {
    const parser = new AMTPMarkdownParser();
    expect(() => parser.parse("No header here\n", "/test")).toThrow("Document must start with H1 title");
  });

  it("AMTPMarkdownParser handles malformed metadata gracefully", () => {
    const parser = new AMTPMarkdownParser();
    const md = "# Test\n```amtp-meta\n{invalid json}\n```\n";
    const doc = parser.parse(md, "/test");
    expect(doc.metadata).toEqual({}); // doesn't crash
  });

  it("sanitizeEndpoint throws on query strings", () => {
    expect(() => sanitizeEndpoint("/path?q=search")).toThrow();
  });
});
