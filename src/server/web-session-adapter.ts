import { Request, Response, NextFunction } from "express";
import { SessionManager } from "./amtp-server";
import { Session } from "../types/amtp.types";

/**
 * Projection of user data that is safe to expose to agents/LLMs.
 * Never includes sensitive fields like password hashes, OAuth tokens, etc.
 */
export interface AMTPUserProfile {
  id: string;
  username: string;
  email?: string;
  role?: string;
  permissions?: string[];
  capabilities?: string[];
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * User resolver that extracts a safe profile from the web request.
 * Return `null` for unauthenticated requests.
 */
export type UserResolver = (req: Request) => AMTPUserProfile | null | Promise<AMTPUserProfile | null>;

export interface WebSessionAdapterConfig {
  sessionManager: SessionManager;
  resolveUser: UserResolver;
  sessionTTLMs?: number;
}

/**
 * WebSessionAdapter — bridges web framework auth to AMTP.
 *
 * Auto-creates and loads AMTP sessions from existing web auth (Passport, Express
 * sessions, JWT) without requiring a separate token ceremony for end users.
 *
 * ## Security
 *
 * Only projects allowed fields into the AMTP session via `resolveUser`. Even if
 * the underlying `req.user` contains sensitive data (password hashes, API keys,
 * OAuth tokens), those are NEVER exposed to the agent or LLM.
 *
 * ## Usage
 *
 * ```ts
 * const server = new AMTPServer({ port: 3000 });
 *
 * // Auth middleware (Passport, session, JWT, etc.)
 * app.use(passport.session());
 *
 * // Bridge web auth to AMTP
 * server.useWebSession({
 *   resolveUser: (req) => {
 *     if (!req.user) return null;
 *     return {
 *       id: req.user.id,
 *       username: req.user.displayName || req.user.username,
 *       email: req.user.email,
 *       role: req.user.role,
 *       permissions: req.user.permissions,
 *     };
 *   },
 * });
 *
 * await server.start();
 * ```
 */
export class WebSessionAdapter {
  private config: Required<Pick<WebSessionAdapterConfig, "sessionManager" | "resolveUser">> & {
    sessionTTLMs: number;
  };

  constructor(config: WebSessionAdapterConfig) {
    this.config = {
      sessionManager: config.sessionManager,
      resolveUser: config.resolveUser,
      sessionTTLMs: config.sessionTTLMs ?? 24 * 60 * 60 * 1000,
    };
  }

  /**
   * Express middleware that auto-creates or loads an AMTP session from the
   * existing web auth context.
   *
   * Mount this AFTER your auth middleware and AFTER the AMTP context middleware.
   */
  autoSession(): (req: Request, _res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, _res: Response, next: NextFunction) => {
      try {
        const user = await this.config.resolveUser(req);
        if (!user) {
          return next();
        }

        const amtpContext = (req as any).amtpContext as
          | { request?: { sessionId?: string }; session?: Session; user?: Record<string, unknown> }
          | undefined;

        if (!amtpContext) {
          return next();
        }

        let session: Session;
        const existingSessionId = amtpContext.request?.sessionId;
        if (existingSessionId) {
          const loaded = this.config.sessionManager.getSession(existingSessionId);
          if (loaded) {
            session = loaded;
          } else {
            session = this.config.sessionManager.createSession(
              user.id,
              user.username,
              this.config.sessionTTLMs
            );
          }
        } else {
          session = this.config.sessionManager.createSession(
            user.id,
            user.username,
            this.config.sessionTTLMs
          );
        }

        // Only project allowed fields — raw req.user is NEVER stored
        amtpContext.session = {
          sessionId: session.sessionId,
          userId: user.id,
          username: user.username,
          email: user.email,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastActivityAt: session.lastActivityAt,
          capabilities: user.capabilities ?? ["read"],
          permissions: user.permissions ?? [],
          preferences: user.preferences,
          metadata: {
            ...(user.role && { role: user.role }),
            ...user.metadata,
          },
        };

        amtpContext.user = {
          id: user.id,
          username: user.username,
          ...(user.email && { email: user.email }),
          ...(user.role && { role: user.role }),
          ...(user.preferences && { preferences: user.preferences }),
        };
      } catch {
        // If the resolver fails, proceed unauthenticated
      }
      next();
    };
  }
}
