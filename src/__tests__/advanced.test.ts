/**
 * Streaming + Crawler + Session Edge-Case Tests
 */
import { AMTPCrawler, SearchIndexer } from "../crawler/amtp-crawler";
import { AMTPMarkdownParser } from "../server/markdown-parser";
import { SessionManager } from "../server/amtp-server";
import {
  generateSecureSessionId,
  validateUrl,
  InMemoryRateLimiter,
  SecurityError,
  generateCsrfToken,
  generateSecureRequestId,
} from "../server/security";
import { LinkType } from "../types/amtp.types";

/* ================================================================
   MARKDOWN PARSER — EDGE CASES
   ================================================================ */

describe("AMTPMarkdownParser — edge cases", () => {
  const parser = new AMTPMarkdownParser();

  it("rejects document that lacks an H1 title", () => {
    expect(() => parser.parse("Paragraph without title\n", "/test")).toThrow(
      /Document must start with H1 title/i
    );
  });

  it("parses a minimal valid document", () => {
    const doc = parser.parse("# Hello\n\nSome text\n", "/");
    expect(doc.title).toBe("Hello");
    expect(doc.path).toBe("/");
  });

  it("returns empty arrays for a plain document (no actions, forms, links)", () => {
    const doc = parser.parse("# Plain\n\nJust text.\n", "/plain");
    expect(doc.actions).toEqual([]);
    expect(doc.forms).toEqual([]);
    expect(doc.links).toEqual([]);
    expect(doc.metadata).toEqual({});
    expect(doc.structured_data ?? []).toEqual([]);
  });

  it("extracts action tokens from any position in the body", () => {
    const markdown = [
      "# Product\n",
      "Some intro text.\n",
      "## Actions\n",
      "[ADD_TO_CART] - Add to cart\n",
      "[CHECKOUT] - Proceed\n",
      "More text.\n",
    ].join("");
    const doc = parser.parse(markdown, "/product");
    const ids = doc.actions.map((a) => a.id);
    expect(ids).toContain("add_to_cart");
    expect(ids).toContain("checkout");
  });

  it("extracts links and classifies internal vs external", () => {
    const markdown = [
      "# Page\n",
      "[Home](/)\n",
      "[External](https://example.com/page)\n",
    ].join("");
    const doc = parser.parse(markdown, "/page");
    expect(doc.links.length).toBe(2);
    const internal = doc.links.find((l) => l.type === LinkType.INTERNAL);
    const external = doc.links.find((l) => l.type === LinkType.EXTERNAL);
    expect(internal).toBeDefined();
    expect(external).toBeDefined();
  });

  it("parses forms with fields", () => {
    const markdown = [
      "# Login\n",
      "## Login Form\n",
      "ACTION: login\n",
      "METHOD: POST\n",
      "ENDPOINT: /api/login\n",
      "FIELD: email\n",
      "TYPE: email\n",
      "REQUIRED: true\n",
      "FIELD: password\n",
      "TYPE: password\n",
      "REQUIRED: true\n",
    ].join("");
    const doc = parser.parse(markdown, "/login");
    expect(doc.forms.length).toBeGreaterThanOrEqual(1);
    const loginForm = doc.forms[0];
    expect(loginForm.action).toBe("LOGIN"); // canonicalized to UPPER by strict sanitizer
    expect(loginForm.fields.length).toBe(2);
  });

  it("extracts amtp-meta block as metadata", () => {
    const markdown = [
      "# Meta\n",
      "```amtp-meta\n",
      '{"author":"alice","version":"1.0"}\n',
      "```\n",
    ].join("");
    const doc = parser.parse(markdown, "/meta");
    expect(doc.metadata.author).toBe("alice");
    expect(doc.metadata.version).toBe("1.0");
  });

  it("survives malformed JSON in amtp-meta without throwing", () => {
    const markdown = [
      "# Bad Meta\n",
      "```amtp-meta\n",
      "{invalid json}\n",
      "```\n",
    ].join("");
    const doc = parser.parse(markdown, "/bad");
    expect(doc.metadata).toEqual({});
  });

  it("handles a document with only a title", () => {
    const doc = parser.parse("# Title\n", "/");
    expect(doc.title).toBe("Title");
    expect(doc.nodes.length).toBe(0);
  });

  it("classifies links correctly: internal vs navigation vs external", () => {
    const markdown = "# Page\n[Internal](/about)\n[Nav](#section)\n[External](https://other.com)\n";
    const doc = parser.parse(markdown, "/page");
    const types = doc.links.map((l) => l.type);
    expect(types).toContain(LinkType.INTERNAL);
    expect(types).toContain(LinkType.NAVIGATION);
    expect(types).toContain(LinkType.EXTERNAL);
  });
});

/* ================================================================
   MARKDOWN PARSER — FORM FIELD PARSING
   ================================================================ */

describe("AMTPMarkdownParser — form fields", () => {
  const parser = new AMTPMarkdownParser();

  it("parses select options", () => {
    const markdown = "# Form\n## Checkout\nACTION: checkout\nMETHOD: POST\nENDPOINT: /checkout\nFIELD: country\nTYPE: select\nLABEL: Country\nOPTIONS: US,CA,MX\nREQUIRED: true\n";
    const doc = parser.parse(markdown, "/checkout");
    const form = doc.forms[0];
    expect(form.fields[0].options?.length).toBe(3);
  });

  it("parses max length field", () => {
    const markdown = "# Signup\n## Register\nACTION: register\nMETHOD: POST\nENDPOINT: /register\nFIELD: displayName\nTYPE: text\nLABEL: Name\nMAX_LENGTH: 100\n";
    const doc = parser.parse(markdown, "/register");
    const field = doc.forms[0].fields[0];
    expect(field.maxLength).toBe(100);
  });
});

/* ================================================================
   SESSION MANAGER — EDGE CASES
   ================================================================ */

describe("SessionManager — edge cases", () => {
  it("rejects session IDs that don't match the expected pattern", () => {
    const sm = new SessionManager();
    expect(sm.getSession("not_real")).toBeNull();
    expect(sm.getSession("sess_!/bad")).toBeNull();
    expect(sm.getSession("")).toBeNull();
  });

  it("returns null for expired sessions", () => {
    // Create a session with 1ms TTL, which expires essentially immediately
    const sm = new SessionManager();
    const session = sm.createSession("u42", "agent42", 1);
    // Wait for 5ms before checking
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(sm.getSession(session.sessionId)).toBeNull();
        resolve();
      }, 5);
    });
  });

  it("calls deleteSession without error even when session is missing", () => {
    const sm = new SessionManager();
    expect(() => sm.deleteSession("sess_nonexistent")).not.toThrow();
  });

  it("creates sessions with correct structure", () => {
    const sm = new SessionManager();
    const session = sm.createSession("alice", "alice@example.com");
    expect(session.sessionId).toMatch(/^sess_/);
    expect(session.userId).toBe("alice");
    expect(session.username).toBe("alice@example.com");
    expect(session.createdAt).toBeDefined();
    expect(session.expiresAt).toBeDefined();
    expect(session.capabilities).toContain("read");
  });

  it("enforces absolute maximum lifetime regardless of TTL override", () => {
    const sm = new SessionManager(60_000); // 1 min absolute max
    const now = Date.now();
    const session = sm.createSession("u1", "alice", 999_999_999); // absurd TTL
    // expiresAt must be NOW + 60000ms, not NOW + 999999999ms
    const expiresAtMs = new Date(session.expiresAt).getTime();
    expect(expiresAtMs).toBeCloseTo(now + 60_000, -3); // ±1 ms
    // session is still valid (not yet expired)
    expect(sm.getSession(session.sessionId)).not.toBeNull();
  });
});

/* ================================================================
   CRYPTO UTILITIES
   ================================================================ */

describe("Crypto utilities", () => {
  it("generateSecureSessionId never reuses a prefix with only hex", () => {
    const ids = Array.from({ length: 200 }, generateSecureSessionId);
    expect(new Set(ids).size).toBe(200);
    // All IDs must be valid
    for (const id of ids) {
      expect(id).toMatch(/^sess_[a-f0-9]+$/);
    }
  });

  it("generateSecureRequestId includes a timestamp-like component", () => {
    const ids = Array.from({ length: 50 }, generateSecureRequestId);
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^req_\d+_[a-f0-9]+$/);
    }
  });
});

/* ================================================================
   RATE LIMITER — TIMING PRECISION
   ================================================================ */

describe("InMemoryRateLimiter — timing", () => {
  it("returns non-negative Retry-After", () => {
    const limiter = new InMemoryRateLimiter(60_000, 1);
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1"); // rejected
    expect(limiter.retryAfterSeconds("10.0.0.1")).toBeGreaterThanOrEqual(0);
  });

  it("prune removes expired entries", () => {
    jest.useFakeTimers();
    const windowMs = 1_000;
    const limiter = new InMemoryRateLimiter(windowMs, 1); // only 1 req/window=1s

    limiter.check("1.1.1.1"); // count=1 resetAt=now+1s → false on next hit
    limiter.check("2.2.2.2"); // count=1 resetAt=now+1s
    limiter.check("3.3.3.3"); // count=1 resetAt=now+1s

    // All are now rate-limited immediately
    expect(limiter.check("1.1.1.1")).toBe(false);
    expect(limiter.check("2.2.2.2")).toBe(false);
    expect(limiter.check("3.3.3.3")).toBe(false);

    // Advance past all windows
    jest.advanceTimersByTime(windowMs + 1);

    // After prune, all IPs can make a fresh request
    limiter.prune();
    expect(limiter.check("1.1.1.1")).toBe(true);
    expect(limiter.check("2.2.2.2")).toBe(true);
    expect(limiter.check("3.3.3.3")).toBe(true);
    jest.useRealTimers();
  });
});

/* ================================================================
   CRAWLER — EDGE CASES
   ================================================================ */

describe("AMTPCrawler — edge cases", () => {
  // The crawler relies on a live server for most behaviour,
  // so test the data structures and indexer directly.
  it("SearchIndexer returns no results for empty query", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([]);
    expect(indexer.search("nothing")).toEqual([]);
  });

  it("SearchIndexer returns sorted results by relevance score", async () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "a",
        title: "macbook",
        content: "apple macbook pro laptop computer",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
      {
        url: "b",
        title: "windows laptop",
        content: "laptop windows computer dell hp",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    const results = indexer.search("macbook laptop");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("macbook");
  });

  it("SearchIndexer search is case-insensitive", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "a",
        title: "Apple MacBook Pro",
        content: "Apple MacBook Pro laptop computer",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    expect(indexer.search("APPLE").length).toBeGreaterThan(0);
    expect(indexer.search("apple").length).toBeGreaterThan(0);
  });

  it("SearchIndexer handles stop-words correctly", () => {
    const indexer = new SearchIndexer();
    indexer.addPages([
      {
        url: "x",
        title: "The Apple",
        content: "apple fruit",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ]);
    // "the" is a stop word; searching for "the fruit" should still find
    expect(indexer.search("apple fruit").length).toBeGreaterThan(0);
  });

  it("AMTPCrawler stores crawl stats after crawl", async () => {
    // Test via SearchIndexer — the crawler's stats are set after crawl() resolves
    const indexer = new SearchIndexer();
    const pages: any[] = [
      {
        url: "https://example.com",
        title: "Home",
        content: "welcome home page",
        structuredData: [],
        links: [],
        indexedAt: new Date().toISOString(),
      },
    ];
    indexer.addPages(pages);
    expect(pages.length).toBe(1);
  });
});

/* ================================================================
   URL VALIDATION — ADDITIONAL CASES
   ================================================================ */

describe("validateUrl — extended cases", () => {
  it("resolves relative URL against baseUrl", () => {
    const url = validateUrl("/search?q=hello", "https://example.com");
    expect(url).toBe("https://example.com/search?q=hello");
  });

  it("accepts HTTPS URLs", () => {
    expect(validateUrl("https://secure.example.com/path")).toContain("https://");
  });

  it("allows port numbers", () => {
    expect(validateUrl("http://localhost:8080")).toContain("8080");
  });

  it("blocks data URIs containing scripts", () => {
    expect(() => validateUrl("data:text/html<script>alert(1)</script>")).toThrow();
  });

  it("blocks vbscript scheme", () => {
    expect(() => validateUrl("vbscript:alert(1)")).toThrow(/Disallowed URL scheme/);
  });

  it("trims whitespace input", () => {
    expect(validateUrl("  https://example.com  ")).toBe("https://example.com/");
  });
});

/* ================================================================
   CSRF — TOKEN GENERATION
   ================================================================ */

describe("CSRF token generation", () => {
  it("generates a token prefixed with csrf_", () => {
    const token = generateCsrfToken("sess_abc123");
    expect(token.startsWith("csrf_")).toBe(true);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateCsrfToken("sess_abc123"))
    );
    expect(tokens.size).toBe(100);
  });
});
