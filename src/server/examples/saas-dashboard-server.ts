/**
 * AMTP — SaaS Multi-Tenant Workspace Dashboard  (Example Server)
 *
 * Demonstrates AMTP used as the primary API surface for a real
 * SaaS application: shared-workspace project-management tool with
 * SQLite persistence and JWT authentication.
 *
 * Schema (sqlite3)
 * ┌────────────────────────────────────────────────┐
 * │ tenants        │ users                          │
 * │─────────────── │───────────────────────────────│
 * │ id TEXT PK     │ id TEXT PK                    │
 * │ name TEXT      │ tenantId TEXT FK → tenants    │
 * │ plan TEXT      │ email TEXT UNIQUE             │
 * │ createdAt TEXT │ passwordHash TEXT             │
 * │               │ name TEXT                     │
 * │               │ role TEXT (owner|admin|member) │
 * │               │ createdAt TEXT                │
 * ├───────────────┴───────────────────────────────┤
 * │ workspaces                                          │
 * │────────────────────────────────────────────────────│
 * │ id TEXT PK                                         │
 * │ tenantId TEXT FK → tenants                         │
 * │ name TEXT                                          │
 * │ description TEXT                                   │
 * │ createdAt TEXT                                     │
 * │ updatedAt TEXT                                     │
 * │────────────────── ─ ──────────────────────────────│
 * │ workspace_members                                   │
 * │────────────────────────────────────────────────────│
 * │ workspaceId TEXT FK → workspaces                    │
 * │ userId TEXT FK → users                               │
 * │ role TEXT (owner|editor|viewer)                      │
 * │ joinedAt TEXT                                        │
 * │ PRIMARY KEY (workspaceId, userId)                    │
 * └────────────────────────────────────────────────────┘
 *
 * Run:
 *   npm run server:saas
 *   # or
 *   ts-node src/server/examples/saas-dashboard-server.ts
 */

import express, { Request, Response } from "express";
import sqlite3, { Database } from "sqlite3";
import crypto from "crypto";
// @ts-ignore - bcryptjs has no types, used only in this demo server
import bcrypt from "bcryptjs";
// @ts-ignore - jsonwebtoken has no bundled types in this setup
import { sign, verify } from "jsonwebtoken";
import { AMTPResponseBuilder } from "../amtp-server.js";
import { MIMEType } from "../../types/amtp.types.js";
import type { AMTPDocument } from "../../types/amtp.types.js";

/* ================================================================
   CONFIGURATION
   ================================================================ */

const PORT = parseInt(process.env.AMTP_PORT || "3000", 10);
const JWT_SECRET = process.env.JWT_SECRET || "amtp-saas-jwt-dev-change-me";
const DB_PATH = process.env.DB_PATH || "./.workspace.db";

/* ================================================================
   DATABASE — SCHEMA + SEED
   ================================================================ */

const sqlite = new Database(DB_PATH);

sqlite.serialize(() => {
  // Tenants
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      plan        TEXT NOT NULL DEFAULT 'free',
      createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Users (per tenant)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      tenantId        TEXT NOT NULL REFERENCES tenants(id),
      email           TEXT NOT NULL UNIQUE,
      passwordHash    TEXT NOT NULL,
      name            TEXT NOT NULL,
      role            TEXT NOT NULL CHECK(role IN ('owner','admin','member')),
      createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Workspaces
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          TEXT PRIMARY KEY,
      tenantId    TEXT NOT NULL REFERENCES tenants(id),
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Workspace members
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspaceId TEXT NOT NULL REFERENCES workspaces(id),
      userId      TEXT NOT NULL REFERENCES users(id),
      role        TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
      joinedAt    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (workspaceId, userId)
    )
  `);

  // Seed a demo tenant + user if empty
  sqlite.get("SELECT COUNT(*) AS c FROM tenants", (err: any, row: any) => {
    if (err || (row as any).c > 0) return;
    const tenantId = "t_demo";
    sqlite.run(`INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)`, [
      tenantId, "Demo Tenant", "pro",
    ], () => {
      const userId = "u_demo";
      const pwd = "demo-password";
      bcrypt.hash(pwd, 10, (err2: any, hash: string) => {
        if (err2) return console.error("BCRYPT ERROR", err2);
        sqlite.run(
          `INSERT INTO users (id, tenantId, email, passwordHash, name, role) VALUES (?,?,?,?,?,?)`,
          [userId, tenantId, "demo@example.com", hash, "Demo User", "owner"],
          () => {
            const wsId = "w_main";
            sqlite.run(
              `INSERT INTO workspaces (id, tenantId, name, description) VALUES (?,?,?,?)`,
              [wsId, tenantId, "Main Workspace", "Primary demo workspace"],
              () => {
                sqlite.run(
                  `INSERT INTO workspace_members (workspaceId, userId, role) VALUES (?,?,?)`,
                  [wsId, userId, "owner"]
                );
              }
            );
          }
        );
      });
    });
  });
});

/* ================================================================
   AUTH HELPERS
   ================================================================ */

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function signJwt(userId: string, tenantId: string, role: string): string {
  return sign({ userId, tenantId, role }, JWT_SECRET, { expiresIn: "24h" });
}

function requireAuth(req: any): { userId: string; tenantId: string; role: string } | null {
  const header = (req.header("authorization") || "").replace(/^Bearer\s+/, "");
  if (!header) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const decoded: any = verify(header, JWT_SECRET);
    return decoded;
  } catch {
    return null;
  }
}

function tenantGuard(db: Database, user: { userId: string }, callback: (tenantId: string) => void) {
  db.get("SELECT role, tenantId FROM users WHERE id = ?", [user.userId], (err: any, row: any) => {
    if (err || !row) return callback("UNAUTHORIZED");
    callback(row.tenantId);
  });
}

/* ================================================================
   REST API — AUTH & TENANT CRUD
   ================================================================ */

const app = express();
app.use(express.json());

/* ── Health ── */
app.get("/health", (_req, res) => res.json({ status: "ok", service: "amtp-saas-dashboard" }));

/* ── Register ── */
app.post("/api/v1/auth/register", (req: any, res: any) => {
  const { tenantName, email, password, name } = req.body || {};
  if (!tenantName || !email || !password || !name) {
    return res.status(400).json({ error: "tenantName, email, password, name are required" });
  }

  const tenantId = genId("t");
  const userId = genId("u");

  bcrypt.hash(password, 10, (err: any, hash: string) => {
    if (err) return res.status(500).json({ error: "hasher error" });

    sqlite.serialize(() => {
      sqlite.run("INSERT INTO tenants (id, name) VALUES (?,?)", [tenantId, tenantName], () => {
        sqlite.run(
          "INSERT INTO users (id, tenantId, email, passwordHash, name, role) VALUES (?,?,?,?,?,?)",
          [userId, tenantId, email, hash, name, "owner"],
          () => {
            const wsId = genId("w");
            sqlite.run(
              "INSERT INTO workspaces (id, tenantId, name) VALUES (?,?,?)",
              [wsId, tenantId, name],
              () => {
                sqlite.run(
                  "INSERT INTO workspace_members (workspaceId, userId, role) VALUES (?,?,?)",
                  [wsId, userId, "owner"],
                  () => {
                    const token = signJwt(userId, tenantId, "owner");
                    res.status(201).json({ token, tenantId, userId, name, role: "owner" });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});

/* ── Login ── */
app.post("/api/v1/auth/login", (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email + password required" });

  sqlite.get("SELECT * FROM users WHERE email = ?", [email], (err2: any, user: any) => {
    if (err2 || !user) return res.status(401).json({ error: "Invalid credentials" });
    bcrypt.compare(password, user.passwordHash, (err3: any, ok: boolean) => {
      if (err3 || !ok) return res.status(401).json({ error: "Invalid credentials" });
      res.json({ token: signJwt(user.id, user.tenantId, user.role), userId: user.id, tenantId: user.tenantId, role: user.role });
    });
  });
});

/* ── Me ── */
app.get("/api/v1/me", (req: any, res: any) => {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  sqlite.get("SELECT id, email, name, role, createdAt FROM users WHERE id = ?", [user.userId], (err: any, row: any) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

/* ── Workspaces ── */
app.get("/api/v1/workspaces", (req: any, res: any) => {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sql = `
    SELECT w.*, wm.role AS myRole
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspaceId
     WHERE wm.userId = ?
     ORDER BY w.updatedAt DESC
  `;
  sqlite.all(sql, [user.userId], (err: any, rows: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post("/api/v1/workspaces", (req: any, res: any) => {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });

  const wsId = genId("w");
  sqlite.run(
    "INSERT INTO workspaces (id, tenantId, name, description) VALUES (?,?,?,?)",
    [wsId, user.tenantId, name, description || ""],
    (err: any) => {
      if (err) return res.status(500).json({ error: err.message });
      sqlite.run("INSERT INTO workspace_members (workspaceId, userId, role) VALUES (?,?,?)", [wsId, user.userId, "owner"], () => {
        res.status(201).json({ id: wsId, name, description: description || "", myRole: "owner" });
      });
    }
  );
});

app.get("/api/v1/workspaces/:id", (req: any, res: any) => {
  const user = requireAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.params;
  sqlite.get(
    `SELECT w.*, wm.role AS myRole
       FROM workspaces w
       JOIN workspace_members wm ON w.id = wm.workspaceId
      WHERE w.id = ? AND wm.userId = ?`,
    [id, user.userId],
    (err: any, row: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Workspace not found" });
      res.json(row);
    }
  );
});

app.delete("/api/v1/workspaces/:id", (req, res) => {
  const user = requireAuth(req as any);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { id } = req.params;
  sqlite.run("DELETE FROM workspaces WHERE id = ?", [id], (err: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(204).send("");
  });
});

/* ── Members ── */
app.get("/api/v1/workspaces/:wId/members", (req: any, res: any) => {
  const user = requireAuth(req as any);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { wId } = req.params;
  sqlite.get("SELECT 1 AS ok FROM workspace_members WHERE workspaceId=? AND userId=?", [wId, user.userId], (err: any, row: any) => {
    if (err || !row) return res.status(403).json({ error: "Access denied" });
    sqlite.all(
      `SELECT u.id, u.email, u.name, u.role, wm.role AS memberRole, wm.joinedAt
         FROM workspace_members wm
         JOIN users u ON wm.userId = u.id
        WHERE wm.workspaceId = ?`,
      [wId],
      (err2: any, rows: any[]) => { if (err2) return res.status(500).json({ error: err2.message });  res.json(rows); }
    );
  });
});

/* ── AMTP HTML muxer ── */
app.get("/amtp/*", (req, res) => {
  const authHeader = (req.header("authorization") || "") as string;
  const accept = (req.header("accept") || "") as string;
  const isAmtp = accept.includes("amtp") || accept.includes("markdown");

  if (isAmtp && authHeader) {
    const me = requireAuth(req as any);
    if (!me) return res.status(401).json({ error: "Unauthorized" });

    sqlite.all(
      `SELECT w.*, wm.role AS myRole
         FROM workspaces w
         JOIN workspace_members wm ON w.id = wm.workspaceId
        WHERE w.tenantId = ?
        ORDER BY w.updatedAt DESC LIMIT 20`,
      [me.tenantId],
      (_err: any, rows: any[]) => {
        if (_err) return res.status(500).json({ error: _err.message });
         const lines = [
           `# Workspaces`,
           "",
           `Welcome back — ${rows.length} workspace(s)`,
           "",
           ...["", "## Actions", "[CREATE_WORKSPACE] — Create a new workspace", "", "## Workspaces"]
             .concat(rows.map((w: any) => `[${w.name}](/api/v1/workspaces/${w.id})`))
             .concat([""]),
         ].join("\n");
 
         const builder = new AMTPResponseBuilder();
         const { headers, body } = builder.build(lines, {
           sessionId: `sess_${me.userId}`,
         });
         res.setHeader("content-type", MIMEType.AMTP_MARKDOWN);
         for (const [k, v] of Object.entries(headers)) {
           if (v !== undefined) res.setHeader(k, v);
         }
         res.send(body);

      }
    );
  } else {
    const simpleHTML = `<!DOCTYPE html><html><body><h1>AMTP SaaS Dashboard</h1><p>Use the <tt>Accept: text/amtp+markdown</tt> header to get AMTP documents, or open the <a href="/amtp/workspaces">AMTP overview</a>.</p></body></html>`;
    res.setHeader("content-type", "text/html");
    res.send(simpleHTML);
  }
});

/* ── Root landing with content negotiation ── */
app.get("/", (req, res) => {
  const accept = (req.header("accept") || "") as string;
  const isAmtp = accept.includes("amtp") || accept.includes("markdown");
  if (isAmtp) {
    const md = `# AMTP SaaS Dashboard\n\nMulti-tenant workspace demo powered by AMTP.\n\nUse Authorization: Bearer <token> for authenticated AMTP routes under /amtp/*\n\n## Demo\n\n- Login: POST /api/v1/auth/login\n- AMTP Workspaces: GET /amtp/workspaces\n\n## Actions\n\n[LOGIN] [VIEW_WORKSPACES]`;
    const builder = new AMTPResponseBuilder();
    const { headers, body } = builder.build(md);
    res.setHeader("content-type", MIMEType.AMTP_MARKDOWN);
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) res.setHeader(k, v);
    }
    res.send(body);
  } else {
    res.setHeader("content-type", "text/html");
    res.send(`<!DOCTYPE html><html><body><h1>AMTP SaaS Dashboard</h1><p>AMTP-enabled demo. <a href="/amtp/workspaces">Try AMTP view</a> (use Accept header for full experience).</p></body></html>`);
  }
});

/* ================================================================
   START
   ================================================================ */

app.listen(PORT, () => {
  sqlite.serialize(() => {
    sqlite.each("SELECT * FROM tenants", (_err: any, _row: any) => {});
  });

  const tenantRows: string[] = [
    "╔════════════════════════════════════════════════════════════════╗",
    "║       AMTP SaaS Dashboard — Dev Server (SQLite)               ║",
    "╠════════════════════════════════════════════════════════════════╣",
  ];
  console.log(tenantRows.join("\n"));
  console.log(`║  🚀  Server     : http://localhost:${PORT}/                            ║`);
  console.log(`║  📊  Workspaces : GET http://localhost:${PORT}/amtp/workspaces      ║`);
  console.log(`║  🔑  Login      : POST http://localhost:${PORT}/api/v1/auth/login     ║`);
  console.log(`║                                                                 ║`);
  console.log(`║  Demo user : demo@example.com / demo-password                  ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
});

process.on("SIGINT", () => {
  console.log("\n[amtp-saas] Shutting down...");
  sqlite.close();
  process.exit(0);
});

export default app;
