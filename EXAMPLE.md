# Example: Building an AMTP App from Scratch

Step-by-step guide to building a markdown-first web application with `@amtp/protocol`.

---

## 1. Install

```bash
npm install @amtp/protocol
```

## 2. Hello World Server

Create `server.ts`:

```typescript
import { AMTPServer, AMTPResponseBuilder, MIMEType } from "@amtp/protocol";
import type { AMTPDocument } from "@amtp/protocol";

const server = new AMTPServer({ port: 3000 });
const builder = new AMTPResponseBuilder();

server.register("GET", "/", (req, res) => {
  const preferred = (req as any).preferredMimeType;
  const doc: AMTPDocument = {
    type: "document",
    version: "2.0",
    title: "Hello AMTP",
    path: "/",
    nodes: [{ type: "paragraph", content: "Welcome to the agentic web." }],
    actions: [],
    forms: [],
    links: [],
    metadata: {},
  };
  const { body, headers } = builder.build(doc);

  if (preferred === "application/json") return res.json(doc);
  for (const [k, v] of Object.entries(headers)) if (v) res.setHeader(k, v);
  res.send(body);
});

server.start().then(() => console.log("Server running on http://localhost:3000"));
```

Run it:

```bash
npx ts-node server.ts
```

Test from another terminal:

```bash
# AMTP (markdown)
curl -H "Accept: text/amtp+markdown" http://localhost:3000

# JSON
curl -H "Accept: application/json" http://localhost:3000

# HTML (browser default)
curl http://localhost:3000
```

## 3. Actions — Let Agents Do Things

Actions are the core of AMTP — they let agents trigger server-side operations.

```typescript
import { HTTPMethod } from "@amtp/protocol";

const todos: { id: string; text: string; done: boolean }[] = [
  { id: "1", text: "Buy groceries", done: false },
];

server.register("GET", "/todos", (req, res) => {
  const preferred = (req as any).preferredMimeType;
  const doc: AMTPDocument = {
    type: "document",
    version: "2.0",
    title: "My Todos",
    path: "/todos",
    nodes: todos.map((t) => ({
      type: "list_item",
      content: `${t.done ? "[x]" : "[ ]"} ${t.text}`,
    })),
    actions: [
      { id: "add_todo", label: "ADD", method: HTTPMethod.POST, endpoint: "/todos", description: "Add a new todo" },
      { id: "toggle_todo", label: "TOGGLE", method: HTTPMethod.POST, endpoint: "/todos/toggle", description: "Toggle todo completion" },
    ],
    forms: [],
    links: [],
    metadata: { count: todos.length },
  };
  const { body, headers } = builder.build(doc);
  for (const [k, v] of Object.entries(headers)) if (v) res.setHeader(k, v);
  res.send(body);
});

server.register("POST", "/todos", (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "missing text" });
  const id = String(todos.length + 1);
  todos.push({ id, text, done: false });
  res.json({ status: "ok", id });
});
```

An agent can discover and invoke:

```
GET /todos → sees [ADD] and [TOGGLE] actions
POST /todos with body { "text": "Write docs" } → creates a todo
```

## 4. Sessions & CSRF Protection

Sessions are created server-side and identified by `x-session-id`.

```typescript
import { SessionManager } from "@amtp/protocol";

const sessions = new SessionManager();

// Login endpoint
server.register("POST", "/login", (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username required" });
  const session = sessions.createSession(`user_${Date.now()}`, username, 3600000);
  const csrfToken = sessions.generateCsrfToken(session.sessionId);
  res.json({
    sessionId: session.sessionId,
    csrfToken,
    expiresAt: session.expiresAt,
  });
});
```

The client then sends:

```
x-session-id: sess_abc123
x-amtp-csrf-token: csrf_def456   ← required for POST/PUT/DELETE
```

CSRF is enforced automatically by the server when `csrfProtection: true` (default).

## 5. Using the AMTP Client

The client SDK makes it easy for agents to interact with AMTP servers.

```typescript
import { AMTPClient } from "@amtp/protocol";

async function main() {
  const client = new AMTPClient({ baseUrl: "http://localhost:3000" });

  // Browse a page
  const page = await client.fetchPage("/todos", {
    headers: { Accept: "text/amtp+markdown" },
  });
  console.log(page.title);       // "My Todos"
  console.log(page.actions);     // [Action, Action]
  console.log(page.raw);         // raw markdown

  // Execute an action
  const result = await client.executeAction("add_todo", {
    text: "Learn AMTP",
  });
  console.log(result);
}

main().catch(console.error);
```

## 6. Forms — Structured Input

Define forms for agent-friendly data entry.

```typescript
server.register("GET", "/contact", (req, res) => {
  const doc: AMTPDocument = {
    type: "document",
    version: "2.0",
    title: "Contact Us",
    path: "/contact",
    nodes: [{ type: "paragraph", content: "Send us a message." }],
    actions: [],
    forms: [
      {
        id: "contact-form",
        action: "send_message",
        method: "POST",
        endpoint: "/contact",
        fields: [
          { name: "name", type: "text", required: true, label: "Your Name" },
          { name: "email", type: "email", required: true, label: "Email" },
          { name: "message", type: "textarea", required: true, label: "Message", maxLength: 500 },
          { name: "priority", type: "select", required: false, label: "Priority",
            options: [
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ],
          },
        ],
      },
    ],
    links: [],
    metadata: {},
  };
  const { body, headers } = builder.build(doc);
  for (const [k, v] of Object.entries(headers)) if (v) res.setHeader(k, v);
  res.send(body);
});
```

## 7. AMTP-QL — Query Documents

AMTP-QL lets agents query document structure with field projections.

```typescript
import { parseAMTPQL, AMTPQLExecutor } from "@amtp/protocol";

const query = `query { document { title nodes(type: ["paragraph"], limit: 5) { content } actions { id description } } }`;
const parsed = parseAMTPQL(query);
const executor = new AMTPQLExecutor();
const result = executor.execute(myDocument, parsed);
// { title: "...", nodes: [...], actions: [...] }
```

## 8. Full CRUD Example

Combining everything into a RESTful todo API with AMTP markdown responses:

<details>
<summary>Complete server.ts (~80 lines)</summary>

```typescript
import {
  AMTPServer, AMTPResponseBuilder, MIMEType, HTTPMethod, SessionManager,
} from "@amtp/protocol";
import type { AMTPDocument } from "@amtp/protocol";

const server = new AMTPServer({ port: 3000, csrfProtection: true });
const builder = new AMTPResponseBuilder();
const sessions = new SessionManager();

interface Todo { id: string; text: string; done: boolean }
const todos: Todo[] = [];

function sendAMTP(res: any, doc: AMTPDocument) {
  const preferred = (res.req as any).preferredMimeType;
  if (preferred === "application/json") return res.json(doc);
  const { body, headers } = builder.build(doc);
  for (const [k, v] of Object.entries(headers)) if (v) res.setHeader(k, v);
  res.send(body);
}

// Auth (no CSRF needed for login — session doesn't exist yet)
server.register("POST", "/login", (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username required" });
  const session = sessions.createSession(`user_${Date.now()}`, username);
  const csrf = sessions.generateCsrfToken(session.sessionId);
  res.json({ sessionId: session.sessionId, csrfToken: csrf });
});

// List todos
server.register("GET", "/todos", (_req, res) => {
  sendAMTP(res, {
    type: "document", version: "2.0", title: `Todos (${todos.length})`, path: "/todos",
    nodes: todos.map((t) => ({
      type: "list_item",
      content: `${t.done ? "[x]" : "[ ]"} ${t.text}  [TOGGLE /todos/${t.id}/toggle] [DELETE /todos/${t.id}]`,
    })),
    actions: [
      { id: "add_todo", label: "ADD", method: HTTPMethod.POST, endpoint: "/todos", description: "Add todo" },
    ],
    forms: [], links: [], metadata: {},
  });
});

// Add todo
server.register("POST", "/todos", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text required" });
  todos.push({ id: String(todos.length + 1), text, done: false });
  res.json({ status: "ok", count: todos.length });
});

// Toggle todo
server.register("POST", "/todos/:id/toggle", (req, res) => {
  const todo = todos.find((t) => t.id === req.params.id);
  if (!todo) return res.status(404).json({ error: "not found" });
  todo.done = !todo.done;
  res.json({ status: "ok", id: todo.id, done: todo.done });
});

// Delete todo
server.register("DELETE", "/todos/:id", (req, res) => {
  const idx = todos.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  todos.splice(idx, 1);
  res.json({ status: "ok" });
});

server.start().then(() => {
  console.log("Todo API running at http://localhost:3000");
  console.log("  curl -H 'Accept: text/amtp+markdown' http://localhost:3000/todos");
});
```

</details>

## 9. Permissions & Policies

Gate actions behind declarative permissions resolved via role-based policies.

```typescript
import { PermissionGuard } from "@amtp/protocol";

const guard = new PermissionGuard();

const doc: AMTPDocument = {
  type: "document", version: "2.0", title: "Admin Panel", path: "/admin",
  nodes: [],
  actions: [
    { id: "delete_user", label: "DELETE", method: "POST", endpoint: "/admin/users/delete",
      permissions: ["user:delete"] },
  ],
  forms: [], links: [],
  metadata: {},
  permissions: [
    { id: "user:delete", name: "Delete Users", resource: "users:*", actions: ["delete_user"] },
  ],
  policies: [
    { id: "admin-policy", name: "Admin Policy", permissions: ["user:delete"], roles: ["admin"] },
  ],
};

// In a route handler:
const result = guard.check(action, doc, session);
if (!result.allowed) return res.status(403).json({ error: result.reason });
```

## Next Steps

- Read `USAGE_GUIDE.md` for detailed API reference (CLI, crawler, benchmarks, Docker)
- Browse `src/server/examples/` for full working servers (basic, SaaS dashboard)
- Run `npm run server` to start the basic example
- Run `npm run client` to see the client in action against the example server
