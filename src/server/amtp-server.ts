/**
 * AMTP Express Middleware & Server Core
 * HTTP server integration for AMTP protocol
 */

import compression from "compression";
import express, {
  Express,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";
import {
  AMTPContext,
  AMTPDocument,
  AMTPRequestHeaders,
  AMTPResponseHeaders,
  AMTPPageRequest,
  Session,
  StatusCode,
  MIMEType,
  AgentCapability,
  ErrorCode,
  AMTPError,
  AMTPQLQueryRequest,
  AMTPQLQueryResponse,
  MarkdownNode,
  MarkdownNodeType,
} from "../types/amtp.types";
import {
  generateSecureSessionId,
  DEFAULT_SESSION_TIMEOUT_MS,
  MAX_SESSION_LIFETIME_MS,
  AMTP_SECURITY_HEADERS,
  InMemoryRateLimiter,
  isValidSessionId,
  csrfHeaderName,
  generateCsrfToken,
  isValidCsrfToken,
  SecurityError,
  DEFAULT_MAX_BODY_SIZE,
} from "./security";
import { parseAMTPQL, AMTPQLSyntaxError } from "./amtp-ql-parser";
import { AMTPQLExecutor } from "./amtp-ql-executor";

/**
 * AMTP Server Configuration
 */
export interface AMTPServerConfig {
  port: number;
  host: string;
  sessionTimeout: number; // ms
  enableCORS: boolean;
  enableCompression: boolean;
  enableSecurityHeaders?: boolean;   // default: true
  enableRateLimit?: boolean;         // default: true
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
  maxRequestBodySize?: number;       // bytes, default: 1 MB
  trustedOrigins?: string[];         // allowed CORS origins; [] = closed; undefined = *
  csrfProtection?: boolean;          // default: true
  sessionAbsoluteMaxLifetime?: number; // ms, default: 7 days
  cache?: {
    enabled: boolean;
    defaultTTL: number; // seconds
  };
}

/**
 * AMTP Request Parser
 * Converts Express request to AMTP request
 */
export class AMTPRequestParser {
 
  parse(req: express.Request): AMTPPageRequest {

    const headers: AMTPRequestHeaders = {
      accept: req.header("accept"),
      "user-agent": req.header("user-agent"),
      "x-amtp-capabilities": req.header("x-amtp-capabilities"),
      "x-session-id": req.header("x-session-id"),
      "x-agent-identity": req.header("x-agent-identity"),
      authorization: req.header("authorization"),
    };

    // SECURITY: Only accept syntactically valid session IDs from clients
    const rawSessionId = req.header("x-session-id");
    const sessionId = isValidSessionId(rawSessionId) ? rawSessionId : undefined;

    const capabilities = this.parseCapabilities(
      req.header("x-amtp-capabilities") || ""
    );

    // SECURITY: Sanitize error message text before exposing it in downstream text
    const sanitizedPath = req.path.replace(/\r?\n/g, "");

    return {
      path: sanitizedPath,
      headers,
      query: req.query as Record<string, string | string[]>,
      sessionId,
      capabilities,
    };
  }

  private parseCapabilities(header: string): AgentCapability[] {
    if (!header) return [];
    return header
      .split(",")
      .map((c) => c.trim().toLowerCase() as AgentCapability)
      .filter((c) => Object.values(AgentCapability).includes(c));
  }
}

/**
 * AMTP Response Builder
 * Constructs HTTP response from AMTP document
 */
export class AMTPResponseBuilder {
  build(
    doc: AMTPDocument | string,
    options?: {
      sessionId?: string;
      cacheControl?: string;
      etag?: string;
    }
  ): { headers: AMTPResponseHeaders; body: string } {
    let body: string;

    if (typeof doc === "string") {
      body = doc;
    } else {
      body = this.documentToMarkdown(doc);
    }

    const headers: AMTPResponseHeaders = {
      "content-type": MIMEType.AMTP_MARKDOWN,
      "x-amtp-version": "1.0",
      ...(options?.sessionId && { "x-session-id": options.sessionId }),
      ...(options?.cacheControl && {
        "cache-control": options.cacheControl,
      }),
      ...(options?.etag && { etag: options.etag }),
    };

    return { headers, body };
  }

  private documentToMarkdown(doc: AMTPDocument): string {
    let md = `# ${doc.title}\n\n`;

    // Add nodes
    for (const node of doc.nodes) {
      md += this.nodeToMarkdown(node) + "\n";
    }

    // Add actions section if exists
    if (doc.actions.length > 0) {
      md += "\n## Actions\n\n";
      for (const action of doc.actions) {
        md += `[${action.id.toUpperCase()}]`;
        if (action.description) {
          md += ` — ${action.description}`;
        }
        md += "\n";
      }
    }

    // Add structured action definitions (v2.0)
    if (doc.actions.some((a) => a.parameters || a.permissions)) {
      md += "\n```amtp-action\n";
      md += JSON.stringify(doc.actions, null, 2);
      md += "\n```\n";
    }

    // Add permissions (v2.0)
    if (doc.permissions && doc.permissions.length > 0) {
      md += "\n```amtp-permissions\n";
      md += JSON.stringify(doc.permissions, null, 2);
      md += "\n```\n";
    }

    // Add policies (v2.0)
    if (doc.policies && doc.policies.length > 0) {
      md += "\n```amtp-policy\n";
      md += JSON.stringify(doc.policies, null, 2);
      md += "\n```\n";
    }

    // Add skills (v2.0)
    if (doc.skills && doc.skills.length > 0) {
      md += "\n```amtp-skill\n";
      md += JSON.stringify(doc.skills, null, 2);
      md += "\n```\n";
    }

    // Add OAuth auth delegation (v1.1)
    if (doc.auth) {
      md += "\n```amtp-auth\n";
      md += JSON.stringify(doc.auth, null, 2);
      md += "\n```\n";
    }

    // Add metadata
    if (Object.keys(doc.metadata).length > 0) {
      md += "\n```amtp-meta\n";
      md += JSON.stringify(doc.metadata, null, 2);
      md += "\n```\n";
    }

    return md;
  }

  private nodeToMarkdown(node: MarkdownNode): string {
    switch (node.type) {
      case MarkdownNodeType.HEADING: {
        const level = (node.metadata?.level as number) || 2;
        return `${"#".repeat(level)} ${node.content || ""}`;
      }
      case MarkdownNodeType.PARAGRAPH:
        return node.content || "";
      case MarkdownNodeType.IMAGE: {
        const title = node.title ? ` "${node.title}"` : "";
        return `![${node.alt || ""}](${node.url || ""}${title})`;
      }
      case MarkdownNodeType.CODE_BLOCK:
        return "```\n" + (node.content || "") + "\n```";
      case MarkdownNodeType.BLOCKQUOTE:
        return "> " + (node.content || "");
      case MarkdownNodeType.LIST:
        return (node.content || "")
          .split("\n")
          .map((l) => "- " + l)
          .join("\n");
      case MarkdownNodeType.LIST_ITEM:
        return "- " + (node.content || "");
      case MarkdownNodeType.THEMATIC_BREAK:
        return "---";
      case MarkdownNodeType.INLINE_CODE:
        return "`" + (node.content || "") + "`";
      default:
        return node.content || "";
    }
  }
}

/**
 * Session Manager
 * Handles user sessions and state
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private csrfTokens: Map<string, string> = new Map(); // sessionId -> csrfToken
  private _absoluteMaxLifetimeMs: number;

  constructor(absoluteMaxLifetimeMs: number = MAX_SESSION_LIFETIME_MS) {
    this._absoluteMaxLifetimeMs = absoluteMaxLifetimeMs;
  }

  createSession(userId: string, username: string, ttlMs?: number): Session {
    const sessionId = generateSecureSessionId();
    const now = new Date();
    const requestedTtl = ttlMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    const cappedTtl = Math.min(requestedTtl, this._absoluteMaxLifetimeMs);
    const expiresAt = new Date(now.getTime() + cappedTtl);

    const session: Session = {
      sessionId,
      userId,
      username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: now.toISOString(),
      capabilities: ["read", "write"],
      permissions: [],
      preferences: {},
      metadata: {},
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | null {
    if (!isValidSessionId(sessionId)) {
      return null;
    }
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      this.sessions.delete(sessionId);
      this.csrfTokens.delete(sessionId);
      return null;
    }

    // Enforce absolute maximum lifetime regardless of extensions
    const createdAt = new Date(session.createdAt).getTime();
    if (Date.now() - createdAt > this._absoluteMaxLifetimeMs) {
      this.sessions.delete(sessionId);
      this.csrfTokens.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    return session;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.csrfTokens.delete(sessionId);
  }

  /**
   * Generate and store a CSRF token for the given session.
   */
  generateCsrfToken(sessionId: string): string {
    const token = generateCsrfToken(sessionId);
    this.csrfTokens.set(sessionId, token);
    return token;
  }

  /**
   * Validate a CSRF token against the stored token for a session.
   */
  validateCsrfToken(sessionId: string, token: string): boolean {
    if (!isValidSessionId(sessionId) || !isValidCsrfToken(token)) {
      return false;
    }
    const stored = this.csrfTokens.get(sessionId);
    if (!stored) return false;
    // Constant-time comparison to prevent timing attacks
    if (stored.length !== token.length) return false;
    let result = 0;
    for (let i = 0; i < stored.length; i++) {
      result |= stored.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Scan for and evict expired sessions. Call periodically.
   */
  pruneExpired(): void {
    const now = new Date();
    for (const [id, session] of this.sessions) {
      if (new Date(session.expiresAt) < now) {
        this.sessions.delete(id);
        this.csrfTokens.delete(id);
      }
    }
  }
}

/**
 * Content Negotiation
 * Determines response format based on Accept header with proper q-value parsing
 */
export class ContentNegotiator {
  negotiate(acceptHeader: string, _userAgent?: string): MIMEType {
    // SECURITY: Never trust user-agent for format decisions;
    // use only the explicit Accept header
    if (!acceptHeader) {
      return MIMEType.HTML;
    }

    // Parse Accept header into [{ type, subtype, q }] sorted by quality
    const parsed = acceptHeader
      .split(",")
      .map((part) => {
        const pieces = part.trim().split(";");
        const mediaType = pieces[0].trim().toLowerCase();
        let q = 1.0;
        for (let i = 1; i < pieces.length; i++) {
          const param = pieces[i].trim();
          const m = param.match(/^q\s*=\s*([\d.]+)/);
          if (m) {
            q = parseFloat(m[1]);
            if (isNaN(q)) q = 1.0;
          }
        }
        return { mediaType, q };
      })
      .sort((a, b) => b.q - a.q);

    for (const entry of parsed) {
      const mt = entry.mediaType;
      if (mt === "text/amtp+markdown" || mt === "application/amtp+markdown") {
        return MIMEType.AMTP_MARKDOWN;
      }
      if (mt === "text/markdown") {
        return MIMEType.AMTP_MARKDOWN;
      }
      if (mt === "application/json") {
        return MIMEType.JSON;
      }
      if (mt === "text/html" || mt === "*/*") {
        return MIMEType.HTML;
      }
    }

    // Default to HTML
    return MIMEType.HTML;
  }
}

/**
 * AMTP Middleware Factory
 * Creates express middleware for AMTP protocol
 */
export class AMTPMiddlewareFactory {
  private parser: AMTPRequestParser;
  private builder: AMTPResponseBuilder;
  private _sessions: SessionManager;
  private negotiator: ContentNegotiator;

  /**
   * Access the session manager for admin / pruning operations
   */
  get sessions(): SessionManager {
    return this._sessions;
  }

  constructor() {
    this.parser = new AMTPRequestParser();
    this.builder = new AMTPResponseBuilder();
    this._sessions = new SessionManager();
    this.negotiator = new ContentNegotiator();
  }

  /**
   * Main AMTP middleware
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Parse AMTP request
      const amtpRequest = this.parser.parse(req);

      // Create AMTP context
      const context: AMTPContext = {
        request: amtpRequest,
        response: {
          statusCode: StatusCode.OK,
          headers: {
            "content-type": MIMEType.AMTP_MARKDOWN,
            "x-amtp-version": "1.0",
          },
        },
        state: {},
      };

      // Load session if provided
      if (amtpRequest.sessionId) {
        context.session = this._sessions.getSession(amtpRequest.sessionId) || undefined;
      }

      // Attach context to request
      (req as any).amtpContext = context;

      next();
    };
  }

  /**
   * Response sender middleware
   */
  responseSender() {
    return (req: Request, res: Response, next: NextFunction) => {
      const context: AMTPContext = (req as any).amtpContext;

      if (!context || !context.response.body) {
        return next();
      }

      // Set status code
      res.status(context.response.statusCode);

      // Set headers
      Object.entries(context.response.headers).forEach(([key, value]) => {
        if (value) {
          res.setHeader(key, value);
        }
      });

      // Send body
      res.send(context.response.body);
    };
  }

  /**
   * Error handler middleware
   */
  errorHandler() {
    return (
      err: Error,
      req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      if (err instanceof AMTPError) {
        const safeErr = err as AMTPError;
        return res.status(safeErr.statusCode).json({
          status: "error",
          error: {
            code: safeErr.code,
            message: safeErr.message,
          },
        });
      }

      if (err instanceof SecurityError) {
        return res.status(err.statusCode).json({
          status: "error",
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }

      // SECURITY: HIDE all internal error details for non-safe exceptions
      res.status(StatusCode.INTERNAL_ERROR).json({
        status: "error",
        error: {
          code: ErrorCode.SERVER_ERROR,
          message: "Internal server error",
        },
      });
    };
  }

  /**
   * Security headers middleware — adds standard HTTP security headers to all responses
   */
  securityHeaders() {
    return (_req: Request, res: Response, next: NextFunction) => {
      for (const [key, value] of Object.entries(AMTP_SECURITY_HEADERS)) {
        res.setHeader(key, value);
      }
      // Content Security Policy — allow self only for AMTP documents
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none';"
      );
      next();
    };
  }

  /**
   * Rate limiting middleware — rejects requests that exceed the configured window/count
   */
  rateLimit(windowMs: number, maxRequests: number) {
    const limiter = new InMemoryRateLimiter(windowMs, maxRequests);

    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";

      if (!limiter.check(ip)) {
        res.setHeader("Retry-After", String(limiter.retryAfterSeconds(ip)));
        return res.status(StatusCode.TOO_MANY_REQUESTS).json({
          status: "error",
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: "Too many requests. Try again later.",
          },
        });
      }

      next();
    };
  }

  /**
   * CSRF guard — rejects state-changing requests that do not carry a valid CSRF token
   * bound to the active session.
   */
  csrfGuard() {
    return (req: Request, res: Response, next: NextFunction) => {
      const sessionId = req.header("x-session-id") as string | undefined;
      if (!sessionId || !isValidSessionId(sessionId)) {
        return next(); // no session; nothing to protect
      }

      if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
        const token = req.header(csrfHeaderName()) as string | undefined;
        if (!token || !this._sessions.validateCsrfToken(sessionId, token)) {
          return res.status(StatusCode.FORBIDDEN).json({
            status: "error",
            error: {
              code: ErrorCode.PERMISSION_DENIED,
              message: token ? "CSRF token invalid" : "CSRF token missing",
            },
          });
        }
      }

      next();
    };
  }
  /**
   * Content negotiation middleware — resolves the AMTP mime type the client prefers
   */
  contentNegotiation() {
    return (req: Request, res: Response, next: NextFunction) => {
      const accept = req.header("accept") || "";
      const userAgent = req.header("user-agent") || undefined;
      const mimeType = this.negotiator.negotiate(accept, userAgent);

      (req as any).preferredMimeType = mimeType;
      next();
    };
  }

  /**
   * CORS middleware for AMTP
   * `trustedOrigins` is set on the AMTPServer instance and passed here.
   */
  cors(trustedOrigins?: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      let allowedOrigin = "*";

       if (trustedOrigins && trustedOrigins.length > 0) {
         const requestOrigin = req.header("Origin");
         if (requestOrigin && trustedOrigins.includes(requestOrigin)) {
           allowedOrigin = requestOrigin;
         } else {
          return res.status(StatusCode.FORBIDDEN).json({
            status: "error",
            error: { code: ErrorCode.PERMISSION_DENIED, message: "CORS origin rejected" },
          });
        }
      }

      res.header("Access-Control-Allow-Origin", allowedOrigin);
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, X-AMTP-Capabilities, X-Session-ID, X-AMTP-CSRF-Token"
      );
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Expose-Headers", "X-Session-ID, X-RateLimit-Remaining, X-RateLimit-Reset");
      res.header("Access-Control-Max-Age", "300"); // 5 min preflight cache

      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }

      next();
    };
  }
}

/**
 * AMTP Server
 * Main server class wrapping Express
 */
export class AMTPServer {
  private app: Express;
  private config: AMTPServerConfig;
  private middlewareFactory: AMTPMiddlewareFactory;
  private router: Router;
  private customMiddleware: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

  constructor(config: Partial<AMTPServerConfig> = {}) {
    this.app = express();
    this.config = {
      port: 3000,
      host: "localhost",
      sessionTimeout: DEFAULT_SESSION_TIMEOUT_MS,
      enableCORS: true,
      enableCompression: true,
      enableSecurityHeaders: true,
      enableRateLimit: true,
      csrfProtection: true,
      ...config,
    };

    this.middlewareFactory = new AMTPMiddlewareFactory();
    this.router = express.Router();

    this.setupMiddleware();
  }

  private setupMiddleware() {
    // SECURITY: Security headers
    if (this.config.enableSecurityHeaders !== false) {
      this.app.use(this.middlewareFactory.securityHeaders());
    }

    // CORS
    if (this.config.enableCORS) {
      this.app.use(this.middlewareFactory.cors(this.config.trustedOrigins));
    }

    // SECURITY: Request body size limit
    const maxSize = this.config.maxRequestBodySize || DEFAULT_MAX_BODY_SIZE;
    this.app.use(express.json({ limit: maxSize }));
    this.app.use(express.urlencoded({
      extended: true,
      limit: maxSize,
      parameterLimit: 1000,
    }));

    // Compression
    if (this.config.enableCompression) {
      this.app.use(compression());
    }

    // Content negotiation
    this.app.use(this.middlewareFactory.contentNegotiation());

    // SECURITY: Rate limiting
    if (this.config.enableRateLimit !== false) {
      const rlConfig = this.config.rateLimit || { windowMs: 60_000, maxRequests: 60 };
      this.app.use(this.middlewareFactory.rateLimit(rlConfig.windowMs, rlConfig.maxRequests));
    }

    // SECURITY: CSRF protection for mutating methods
    if (this.config.csrfProtection !== false) {
      this.app.use(this.middlewareFactory.csrfGuard());
    }
  }

  /**
   * Register a route handler
   */
  register(
    method: string,
    path: string,
    handler: (req: Request, res: Response) => void
  ) {
    (this.router[method.toLowerCase() as "get" | "post" | "put" | "delete" | "patch"] as any)(
      path,
      handler
    );
  }

  /**
   * Handle an AMTP-QL query (v2.0).
   * The caller provides a function that returns the AMTPDocument to query.
   * Returns { data } or { errors } per AMTPQLQueryResponse.
   */
  async handleAMTPQL(
    body: AMTPQLQueryRequest,
    getDocument: () => AMTPDocument | Promise<AMTPDocument>
  ): Promise<AMTPQLQueryResponse> {
    try {
      const doc = await Promise.resolve(getDocument());
      const parsed = parseAMTPQL(body.query);
      const executor = new AMTPQLExecutor();
      const data = executor.execute(doc, parsed);
      return { data };
    } catch (err: any) {
      if (err instanceof AMTPQLSyntaxError) {
        return {
          errors: [{ message: `Syntax error: ${err.message}`, path: [String(err.position)] }],
        };
      }
      return {
        errors: [{ message: err.message || "AMTP-QL execution failed" }],
      };
    }
  }

  /**
   * Mount custom middleware before routes.
   * Runs after AMTP context but before route handlers.
   */
  use(mw: (req: Request, res: Response, next: NextFunction) => void): void {
    this.customMiddleware.push(mw);
  }

  /**
   * Convenience: mount a WebSessionAdapter to auto-bridge web auth to AMTP.
   * Equivalent to `server.use(adapter.autoSession())`.
   */
  useWebSession(adapter: { autoSession: () => (req: Request, res: Response, next: NextFunction) => void }): void {
    this.use(adapter.autoSession());
  }

  /**
   * Convenience: mount an AMTPAuthService to enable OAuth 2.0 Bearer token
   * authentication + register the token introspection endpoint.
   *
   * ```ts
   * server.useAuthService(authService);
   * ```
   */
  useAuthService(
    authService: {
      middleware: () => (req: Request, res: Response, next: NextFunction) => Promise<void>;
      introspectHandler: () => (req: Request, res: Response) => Promise<void>;
    }
  ): void {
    this.use(authService.middleware());
    this.register("POST", "/amtp/auth/introspect", authService.introspectHandler());
  }

  /**
   * Return the fully configured Express app with routes and middleware mounted.
   * Does NOT start the HTTP listener — useful for testing with supertest.
   */
  getConfiguredApp(): Express {
    // Mount AMTP context (was deferred from setupMiddleware to allow injection)
    this.app.use(this.middlewareFactory.middleware());

    // Mount user-added middleware (web session bridge, custom auth, etc.)
    for (const mw of this.customMiddleware) {
      this.app.use(mw);
    }

    // Mount routes
    this.app.use("/", this.router);

    // Response sender and error handler
    this.app.use(this.middlewareFactory.responseSender());
    this.app.use(this.middlewareFactory.errorHandler());
    return this.app;
  }

  /**
   * Start server
   */
  async start(): Promise<void> {
    this.getConfiguredApp();

    // SECURITY: Periodic session pruning every 5 minutes
    const sessionPruner = () => {
      this.middlewareFactory.sessions.pruneExpired();
    };
    sessionPruner();
    setInterval(sessionPruner, 5 * 60_000).unref?.();

    return new Promise((resolve) => {
      this.app.listen(this.config.port, this.config.host, () => {
        console.log(
          `AMTP Server running on http://${this.config.host}:${this.config.port}`
        );
        resolve();
      });
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get the internal session manager (useful for tests).
   */
  getSessionManager(): SessionManager {
    return this.middlewareFactory.sessions;
  }
}

export default {
  AMTPServer,
  AMTPMiddlewareFactory,
  SessionManager,
  ContentNegotiator,
  AMTPRequestParser,
  AMTPResponseBuilder,
};
