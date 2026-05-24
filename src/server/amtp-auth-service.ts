import { Request, Response, NextFunction } from "express";
import { SessionManager } from "./amtp-server";
import { Session } from "../types/amtp.types";

/**
 * Result of a successful token verification.
 * Only safe, projected fields — never raw token data.
 */
export interface VerifiedToken {
  userId: string;
  username: string;
  email?: string;
  scopes: string[];
  role?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable token verifier. Implement this to support JWT, opaque tokens,
 * or any custom auth mechanism.
 */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken | null>;
}

export interface AMTPAuthServiceConfig {
  sessionManager: SessionManager;
  verifier: TokenVerifier;
  sessionTTLMs?: number;
}

const BEARER_PREFIX = "Bearer ";

/**
 * AMTPAuthService — OAuth 2.0 token verification + session binding.
 *
 * Validates Bearer tokens from the Authorization header, resolves them to
 * user identity + OAuth scopes, and creates/loads AMTP sessions automatically.
 *
 * ## Usage
 *
 * ```ts
 * const authService = new AMTPAuthService({
 *   sessionManager: server.getSessionManager(),
 *   verifier: {
 *     verify: async (token) => {
 *       const payload = jwt.verify(token, secret);
 *       return {
 *         userId: payload.sub,
 *         username: payload.username,
 *         scopes: (payload.scope || "").split(" "),
 *       };
 *     },
 *   },
 * });
 *
 * app.use(authService.middleware());
 * server.register("POST", "/amtp/auth/introspect", authService.introspectHandler());
 * ```
 */
export class AMTPAuthService {
  private config: Required<AMTPAuthServiceConfig>;

  constructor(config: AMTPAuthServiceConfig) {
    this.config = {
      sessionTTLMs: 24 * 60 * 60 * 1000,
      ...config,
    };
  }

  /**
   * Express middleware that checks the Authorization header, verifies the
   * Bearer token, and populates `req.amtpContext.session` with the resolved
   * user identity + OAuth scopes.
   *
   * Mount this AFTER the AMTP context middleware.
   */
  middleware(): (req: Request, _res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
          return next();
        }

        const token = authHeader.slice(BEARER_PREFIX.length).trim();
        if (!token) {
          return next();
        }

        const verified = await this.config.verifier.verify(token);
        if (!verified) {
          return next();
        }

        const amtpContext = (req as any).amtpContext as
          | { request?: { sessionId?: string }; session?: Session; user?: Record<string, unknown> }
          | undefined;

        if (!amtpContext) {
          return next();
        }

        // Create or load AMTP session bound to this user
        const existingSessionId = amtpContext.request?.sessionId;
        let session: Session;

        if (existingSessionId) {
          const loaded = this.config.sessionManager.getSession(existingSessionId);
          session = loaded ?? this.config.sessionManager.createSession(
            verified.userId,
            verified.username,
            this.config.sessionTTLMs
          );
        } else {
          session = this.config.sessionManager.createSession(
            verified.userId,
            verified.username,
            this.config.sessionTTLMs
          );
        }

        // Store OAuth scopes in session capabilities/permissions
        amtpContext.session = {
          sessionId: session.sessionId,
          userId: verified.userId,
          username: verified.username,
          email: verified.email,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastActivityAt: session.lastActivityAt,
          capabilities: verified.scopes,
          permissions: verified.scopes,
          metadata: {
            authMethod: "bearer_token",
            ...(verified.role && { role: verified.role }),
            ...verified.metadata,
          },
        };

        amtpContext.user = {
          id: verified.userId,
          username: verified.username,
          ...(verified.email && { email: verified.email }),
          ...(verified.role && { role: verified.role }),
        };
      } catch {
        // If verification fails, proceed unauthenticated
      }
      next();
    };
  }

  /**
   * Token introspection handler for `POST /amtp/auth/introspect`.
   * Returns token validity + scopes per RFC 7662.
   */
  introspectHandler(): (req: Request, res: Response) => Promise<void> {
    return async (req: Request, res: Response) => {
      const token = req.body?.token || (req.headers.authorization || "").replace(BEARER_PREFIX, "").trim();

      if (!token) {
        res.status(400).json({ active: false, error: "token required" });
        return;
      }

      try {
        const verified = await this.config.verifier.verify(token);
        if (!verified) {
          res.json({ active: false });
          return;
        }

        res.json({
          active: true,
          sub: verified.userId,
          username: verified.username,
          scope: verified.scopes.join(" "),
          ...(verified.email && { email: verified.email }),
          ...(verified.role && { role: verified.role }),
        });
      } catch {
        res.json({ active: false });
      }
    };
  }
}
