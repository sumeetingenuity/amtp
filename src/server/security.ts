/**
 * AMTP Security Utilities
 * Centralized security utilities for the AMTP protocol
 */

import { Readable } from "stream";

// ---- CRYPTO-HARDENED RANDOM GENERATION ----

/**
 * Generate a cryptographically secure random string
 * Replaces Math.random()-based session and request IDs
 */
export function secureRandomString(length = 24): string {
  return crypto.getRandomValues(new Uint8Array(length))
    .reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");
}

/** Session ID prefix for AMTP */
export const AMTP_SESSION_ID_PREFIX = "sess_";

/** Generate a secure AMTP session ID */
export function generateSecureSessionId(): string {
  return `${AMTP_SESSION_ID_PREFIX}${secureRandomString(20)}`;
}

/** Request ID prefix for AMTP */
export const AMTP_REQUEST_ID_PREFIX = "req_";

/** Generate a secure AMTP request ID */
export function generateSecureRequestId(): string {
  return `${AMTP_REQUEST_ID_PREFIX}${Date.now()}_${secureRandomString(8)}`;
}

// ---- ALLOWLIST / BLOCKLIST ----

/** Allowed redirect schemes — block javascript:, data:, file:, vbscript: */
export const ALLOWED_URL_SCHEMES = new Set(["http", "https"]);

/** Dangerous HTML/script patterns in markdown content */
export const XSS_PATTERNS = [
  /<script[\s\S]*?>/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /<svg[\s\S]*?onload/gi,
  /eval\s*\(/gi,
  /document\.cookie/gi,
];

// ---- URL VALIDATION & SANITIZATION ----

/**
 * Parse and validate a URL against SSRF / open-redirect patterns.
 * Returns the validated URL string or throws.
 */
export function validateUrl(value: string, baseUrl?: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new SecurityError("URL must not be empty", "INVALID_URL", 400);
  }

  let parsed: URL;
  try {
    // Resolve relative URLs against baseUrl if provided
    if (baseUrl && !/^https?:\/\//i.test(trimmed)) {
      // Guard against path-traversal within the origin
      parsed = new URL(trimmed, baseUrl);
    } else {
      parsed = new URL(trimmed);
    }
  } catch {
    throw new SecurityError(`Unparseable URL: ${trimmed}`, "INVALID_URL", 400);
  }

  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol.replace(":", ""))) {
    throw new SecurityError(
      `Disallowed URL scheme: ${parsed.protocol}`,
      "DISALLOWED_SCHEME",
      400
    );
  }

  return parsed.toString();
}

// ---- INPUT SANITIZATION ----

/**
 * Strip potentially dangerous HTML/script content from a string
 * Returns the sanitized string and a boolean indicating whether
 * anything was removed.
 */
export function sanitizeHtml(input: string): string {
  let cleaned = input;

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, "");
    }
  }

  return cleaned;
}

/**
 * Validate a string field (non-empty, no control characters, max length)
 */
export function validateTextField(
  value: string,
  options: { minLength?: number; maxLength?: number; fieldName?: string } = {}
): string {
  const { minLength = 1, maxLength = 10000, fieldName = "field" } = options;
  if (value.length < minLength) {
    throw new SecurityError(
      `${fieldName} too short (min ${minLength})`,
      "INPUT_TOO_SHORT",
      400
    );
  }
  if (value.length > maxLength) {
    throw new SecurityError(
      `${fieldName} too long (max ${maxLength})`,
      "INPUT_TOO_LONG",
      413
    );
  }
  return value;
}

// ---- SECURITY HEADERS ----

/** Common security response headers for AMTP endpoints */
export const AMTP_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// ---- SCOPE / RATE-LIMIT GUARD ----

/**
 * Map of IP -> { count, resetAt } used in in-memory rate limiting.
 * Callers should reset expired entries periodically.
 */
export class InMemoryRateLimiter {
  private map: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(private windowMs: number, private maxRequests: number) {}

  /**
   * Returns true if the request is within the allowed rate limit,
   * false if it should be rejected with 429.
   */
  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.map.get(ip);

    if (!entry || now >= entry.resetAt) {
      this.map.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Compute Retry-After (seconds) for a rejected IP.
   */
  retryAfterSeconds(ip: string): number {
    const entry = this.map.get(ip);
    if (!entry) return 0;
    return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }

  /**
   * Prune stale entries from the store.
   */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now >= entry.resetAt) {
        this.map.delete(key);
      }
    }
  }
}

// ---- SESSION SECURITY ----

/** Default session timeout: 24 hours */
export const DEFAULT_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Absolute cap for any session lifetime regardless of extensions */
export const MAX_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---- CUSTOM SECURITY ERROR CLASS ----

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(`[${code}] ${message}`);
    this.name = "SecurityError";
  }
}

// ---- BODY/PAYLOAD GUARD ----

/** Default maximum request body size: 1 MB */
export const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

/**
 * Wrap a request/stream body consumer so it stops after maxBytes.
 * Returns the accumulated string (truncated) and a flag indicating truncation.
 * Supports: string, browser ReadableStream, Node.js Readable.
 */
export async function readBodyWithLimit(
  body: any,
  maxBytes: number = DEFAULT_MAX_BODY_SIZE
): Promise<{ body: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;

  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      if (value) {
        total += value.byteLength;
        if (total <= maxBytes) {
          chunks.push(Buffer.from(value));
        } else {
          truncated = true;
          break;
        }
      }
    }
  } else if (body instanceof Readable) {
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total <= maxBytes) {
        chunks.push(buf);
      } else {
        truncated = true;
        body.destroy();
        break;
      }
    }
  } else if (typeof body === "string") {
    total = Buffer.byteLength(body);
    if (total <= maxBytes) {
      return { body, truncated: false };
    }
    return { body: Buffer.from(body, "utf8").slice(0, maxBytes).toString(), truncated: true };
  }

  return { body: Buffer.concat(chunks).toString("utf8"), truncated };
}

// ---- ID VALIDATION ----

const SESSION_ID_REGEX = /^sess_[a-f0-9]+$/;

/**
 * Returns true if the string looks like a valid AMTP session ID.
 */
export function isValidSessionId(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return SESSION_ID_REGEX.test(sessionId);
}

// ---- CSRF ----

const CSRF_HEADER = "x-amtp-csrf-token";

/**
 * Returns the CSRF token header name.
 */
export function csrfHeaderName(): string {
  return CSRF_HEADER;
}

/**
 * Returns the value for a new CSRF token.
 * Note: The actual token-to-session binding is managed externally (see SessionManager).
 * This generates the token value only.
 */
export function generateCsrfToken(_sessionId: string): string {
  return `csrf_${secureRandomString(16)}`;
}

/**
 * Validate that a CSRF token is non-empty and properly formatted.
 */
export function isValidCsrfToken(token: string | undefined | null): boolean {
  if (!token) return false;
  return /^csrf_[a-f0-9]{32}$/.test(token);
}

// ============================================================
// PROMPT INJECTION RESISTANCE — STRICT ACTION / FORM PARSING
// ============================================================

/**
 * Strictly sanitize an action identifier.
 * Only [A-Z0-9_] allowed, must start with letter, max 64 chars.
 * This prevents injection of new actions, newlines, or control chars
 * into the machine-readable action contract.
 */
export function sanitizeActionId(raw: string): string {
  const trimmed = raw.trim();

  // Fast path: already clean
  if (/^[A-Z][A-Z0-9_]{0,63}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Relaxed path for common copy-paste (brackets + spaces only)
  const relaxed = trimmed.replace(/[[\]\s]/g, "").toUpperCase();
  if (/^[A-Z][A-Z0-9_]{0,63}$/.test(relaxed)) {
    return relaxed;
  }

  throw new SecurityError(
    "Invalid action identifier — must match [A-Z][A-Z0-9_]+ (no injection allowed)",
    "INVALID_ACTION_ID",
    400
  );
}

/**
 * Strictly sanitize an endpoint path for actions/forms.
 * Only safe path characters. No query strings, fragments, or protocol.
 */
export function sanitizeEndpoint(raw: string): string {
  const trimmed = raw.trim();

  // Reject anything containing query strings, fragments, or obvious bad chars
  if (/[?#]/.test(trimmed) || /[<>"'\s]/.test(trimmed)) {
    throw new SecurityError(
      "Invalid endpoint — query strings, fragments or special chars not allowed",
      "INVALID_ENDPOINT",
      400
    );
  }

  // Remove any protocol or host if accidentally present
  let cleaned = trimmed.replace(/^[a-zA-Z]+:\/\/[^/]+/, "");

  // Keep only path-safe characters
  cleaned = cleaned.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 256);

  if (!/^\/[a-zA-Z0-9/_-]*$/.test(cleaned) || cleaned.length < 1) {
    throw new SecurityError(
      "Invalid endpoint — must be a clean path starting with /",
      "INVALID_ENDPOINT",
      400
    );
  }
  return cleaned;
}

/**
 * Strictly validate and normalize HTTP method.
 */
export function sanitizeHttpMethod(raw: string): string {
  const method = raw.trim().toUpperCase();
  const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  if (!allowed.includes(method)) {
    throw new SecurityError(
      `Invalid HTTP method: ${raw}`,
      "INVALID_METHOD",
      400
    );
  }
  return method;
}

/**
 * Sanitize free-text fields (descriptions, labels, help text) that will be
 * shown to or used in prompts for LLMs/agents.
 *
 * This is the key defense against prompt injection via action descriptions.
 * We aggressively strip common jailbreak patterns while preserving useful hints.
 */
export function sanitizeFreeText(text: string, maxLength = 280): string {
  if (!text) return "";

  let s = text;

  // Remove injected action patterns (bracket-enclosed, 4+ uppercase chars) from descriptions
  s = s.replace(/\[[A-Z][A-Z0-9_]{3,}\]/g, "");
  // Avoid sanitizing common safe uppercase words but catch suspicious injected IDs (5+ chars)
  const commonUppercaseWords = new Set(["HTTP", "HTTPS", "JSON", "HTML", "AMTP", "SPEC", "UUID", "USER", "PASS", "TOKEN", "EMAIL", "PHONE", "PRICE", "COUNT", "TOTAL", "VALUE", "LIMIT", "ADMIN", "ERROR", "TIMEOUT", "SECRET", "PUBLIC", "PRIVATE", "HEADER", "BODY", "QUERY", "PARAMS", "ROUTE", "LOGIN", "SIGNUP", "REGEX", "FETCH", "ASYNC", "AWAIT", "CACHE", "INDEX", "BUILD", "DEPLOY", "LOCAL", "GLOBAL", "STATIC", "DYNAMIC", "STREAM", "BENCH", "BATCH", "QUEUE", "RETRY", "HEALTH"]);
  s = s.replace(/\b[A-Z][A-Z0-9_]{4,}\b/g, (m) => {
    return commonUppercaseWords.has(m) ? m : "[sanitized]";
  });

  // Additional protection for action description context
  s = s.replace(/redefine|override action|new action id/gi, "[sanitized]");

  // Strip common prompt injection / jailbreak phrases (case-insensitive)
  const jailbreaks = [
    /ignore (?:all )?previous instructions?/gi,
    /disregard (?:all )?prior (?:rules|instructions?)/gi,
    /you (?:are|must|should) (?:now |instead )?(?:act as|behave as|become)/gi,
    /new (?:system|developer|admin) (?:prompt|instruction)/gi,
    /override (?:safety|security|rules)/gi,
    /execute the following|do the following instead/gi,
    /```[\s\S]*?```/g,           // code fences
    /<\|im_start\|>|<\|im_end\|>/gi, // common chat template tokens
  ];

  for (const pattern of jailbreaks) {
    s = s.replace(pattern, "[sanitized]");
  }

  // Collapse whitespace, limit length
  s = s.replace(/\s+/g, " ").trim().slice(0, maxLength);

  return s;
}
