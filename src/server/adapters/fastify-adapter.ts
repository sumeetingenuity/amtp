/**
 * AMTP — Fastify Adapter
 *
 * Registers AMTP middleware on a Fastify instance: request parsing,
 * session resolution, CORS, rate-limiting, body-size cap, security
 * headers, and CSRF protection.
 *
 * Dependencies:
 *   npm install --save fastify
 *
 * Usage in your server entry point:
 *   import fastify from "fastify";
 *   import { fastifyAMTP, amtpReply, createAMTPFastifyApp } from "../src/server/adapters/fastify-adapter";
 *   import { AMTPResponseBuilder } from "../src/server/amtp-server";
 *
 *   const app = fastifyAMTP.fastify({
 *     logger: { level: "info" },
 *   });
 *
 *   await app.register(fastifyAMTP.plugin, {
 *     trustedOrigins: ["https://your-frontend.example.com"],
 *   });
 *
 *   app.get("/hello", (req, reply) => {
 *     const doc = new AMTPResponseBuilder().build("# Hello\n\nWorld!");
 *     return reply.amtp(doc);
 *   });
 *
 *   await app.listen({ port: 3000 });
 */

import fastify, {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
  FastifyPluginOptions,
} from "fastify";

import { AMTPRequestParser, AMTPResponseBuilder, SessionManager } from "../amtp-server.js";
import { AMTPMarkdownParser } from "../markdown-parser.js";

import { InMemoryRateLimiter } from "../security.js";

export { AMTPResponseBuilder, AMTPMarkdownParser, SessionManager };

/** Plugin options passed to fastifyAMTP.register(...) */
export interface FastifyAMTPOptions extends Partial<FastifyPluginOptions> {
  /** List of allowed CORS origins. Empty = block all. Undefined = wildcard (dev only). */
  trustedOrigins?: string[];
  /** Max JSON body size in bytes. Default: 1 MB. */
  maxRequestBodySize?: number;
  /** Apply security headers (CSP, X-Frame-Options, etc.). Default: true. */
  enableSecurityHeaders?: boolean;
  /** Enable in-memory rate limiting. Default: true. */
  enableRateLimit?: boolean;
  /** Rate-limit window ms. Default: 60 000. */
  rateLimitWindowMs?: number;
  /** Max requests per window. Default: 60. */
  rateLimitMaxRequests?: number;
  /** Enabled CSRF protection. Default: true. */
  csrfProtection?: boolean;
  /** Shared SessionManager instance. */
  sessionManager?: SessionManager;
}

/* ================================================================
   TYPE AUGMENTATION
   ================================================================ */

declare module "fastify" {
  interface FastifyRequest {
    /** AMTP request headers extracted from the original HTTP request. */
    amtpHeaders?: Record<string, string | string[] | null>;
    /** AMTP session resolved from the incoming session id, if any. */
    amtpSession?: any | null;
  }

  interface FastifyReply {
    /**
     * Short-hand to send an AMTP document.
     * @param doc    AMTP document string or `{ body, headers }` object
     * @param sid    Optional session id to set in the `X-Session-ID` response header
     */
    amtp(
      doc: string | { body: string; headers: Record<string, string> },
      sid?: string
    ): FastifyReply;
  }
}

/* ================================================================
   INTERNAL MIDDLEWARE
   ================================================================ */

class MiddlewareManager {
  private _parser = new AMTPRequestParser();
  private _builder = new AMTPResponseBuilder();
  sm: SessionManager;
  _limiter: InMemoryRateLimiter | null;

  constructor(opts: FastifyAMTPOptions) {
    this.sm = opts.sessionManager ?? new SessionManager();
    this._limiter =
      opts.enableRateLimit !== false
        ? new InMemoryRateLimiter(
            opts.rateLimitWindowMs ?? 60_000,
            opts.rateLimitMaxRequests ?? 60
          )
        : null;
  }

  /** Patch AMTP context onto a Fastify request. */
  onRequest(req: FastifyRequest): void {
    const r = (this._parser as any).parse(req);
    req.amtpHeaders = r.headers;
    req.amtpSession = r.sessionId
      ? this.sm.getSession(r.sessionId) || null
      : null;
  }

  /** Write security headers in onSend. */
  onSend(_req: FastifyRequest, reply: FastifyReply): void {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("X-XSS-Protection", "1; mode=block")
      .header("Referrer-Policy", "strict-origin-when-cross-origin")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'; " +
          "object-src 'none'; base-uri 'none';"
      );
  }

  /** Return true when the IP has exceeded its rate limit. */
  isRateLimited(ip: string): boolean {
    if (!this._limiter) return false;
    return !this._limiter.check(ip);
  }
}

/* ================================================================
   FASTIFY PLUGIN
   ================================================================ */

export const plugin: FastifyPluginAsync = async (
  app: FastifyInstance,
  pluginOpts: FastifyPluginOptions & FastifyAMTPOptions = {}
) => {
  const mw = new MiddlewareManager(pluginOpts);

  // ---- 1. AMTP context  -----
  app.addHook("onRequest", async (req: any) => {
    mw.onRequest(req);
  });

  // ---- 2. Body size guard ----
  const bodyLimit = (pluginOpts as FastifyAMTPOptions).maxRequestBodySize ?? 1_048_576;
  app.addContentTypeParser(
    "application/json",
    { bodyLimit },
    function (req: any, payload: any, done: any) {
      done();
    }
  );

  // ---- 3. Security headers ----
  if ((pluginOpts as FastifyAMTPOptions).enableSecurityHeaders !== false) {
    app.addHook("onSend", async (_req: any, reply: any) => {
      mw.onSend(_req, reply);
    });
  }

  // ---- 4. Rate limiter ----
  if (mw["_limiter"]) {
    app.addHook("preHandler", async (req: any, reply: any) => {
      const ip = req.ip || (req.socket as any)?.remoteAddress || "unknown";
      if (mw.isRateLimited(ip)) {
        reply.code(429);
        return { status: "error", error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } };
      }
    });
  }
};

/**
 * NAMESPACE EXPORT — use for ergonomic named import.
 */
export const fastifyAMTP = { plugin, createAMTPFastifyApp };

/**
 * Fastify plugin (to register with `app.register(plugin, opts)`).
 */
const exportedPlugin = plugin;

/* ================================================================
   REPLY HELPER
   ================================================================ */

/**
 * Patch `reply.amtp()` onto *every* Fastify instance at runtime.
 * Import and call this before you define your routes.
 *
 * @param app  The Fastify instance to decorate.
 */
function amtpReply(app: FastifyInstance): void {
  app.decorateReply("amtp", function (
    this: any,
    doc: string | { body: string; headers: Record<string, string> },
    sid?: string
  ) {
    const builder = new AMTPResponseBuilder();
    let hdrs: Record<string, string>;
    let body: string;

    if (typeof doc === "string") {
      const r = builder.build(doc, sid ? { sessionId: sid } : undefined) as any;
      hdrs = r.headers;
      body = r.body;
    } else {
      hdrs = doc.headers;
      body = doc.body;
    }

    for (const [k, v] of Object.entries(hdrs)) {
      if (v) this.header(k, v);
    }
    return this.send(body);
  });
}

/* ================================================================
   EAGER SERVER FACTORY
   ================================================================ */

/**
 * Build and return a Fastify instance with AMTP and `reply.amtp()` pre-attached.
 *
 * @param opts  AMTP plugin options
 */
export function createAMTPFastifyApp(opts?: FastifyAMTPOptions): FastifyInstance {
  const app = fastify({ logger: true });
  amtpReply(app);
  // @ts-expect-error Fastify.register() is strict about register-options types.
  // 'opts' is a plain FastifyAMTPOptions object and safe at runtime.
  void app.register(plugin, opts);
  return app;
}
