# AMTP Reference Implementation

A standalone reference implementation of the AMTP protocol with a server and client.

## Prerequisites

- Node.js >= 18
- npm >= 9

## Server

A reference AMTP server with example skills (echo, greet, calculator, weather).

```bash
cd reference/server
npm install
npx tsx server.ts
```

The server starts on `http://localhost:3099` with:

| Route | Description |
|-------|-------------|
| `GET /` | Root AMTP document with links to all skills |
| `GET /skills/echo` | Echo skill — accepts a message and returns it |
| `GET /skills/greet` | Greet skill — accepts a name and returns a greeting |
| `GET /skills/calculator` | Calculator skill — basic arithmetic operations |
| `GET /api/actions/:skill/:action` | Execute an action |
| `GET /health` | Health check |

### Content Negotiation

```bash
# Get AMTP markdown (for agents)
curl -H "Accept: text/amtp+markdown" http://localhost:3099/skills/echo

# Get JSON (for API clients)
curl -H "Accept: application/json" http://localhost:3099/skills/echo

# Get HTML (for browsers)
curl http://localhost:3099/skills/echo
```

### Execute an Action

```bash
curl -X POST http://localhost:3099/api/actions/echo/say \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello AMTP!"}'
```

## Client

A reference client that discovers and executes skills on the reference server.

```bash
cd reference/client
npm install
npx tsx client.ts
```

The client demonstrates:
1. Discovering available skills from the root document
2. Fetching skill capability contracts
3. Executing actions on each skill
4. Batch execution

## Architecture

```
┌─────────────┐     HTTP / AMTP      ┌──────────────┐
│   Client    │ ──────────────────▶  │    Server    │
│  (agent)    │ ◀──────────────────  │  (registry)  │
└─────────────┘                      └──────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │   Skill Handlers │
                                    │ ┌──────────────┐ │
                                    │ │ Echo         │ │
                                    │ │ Greet        │ │
                                    │ │ Calculator   │ │
                                    │ └──────────────┘ │
                                    └──────────────────┘
```

## Testing with an AI Agent

```bash
# 1. Start the server
cd reference/server && npx tsx server.ts

# 2. Point your AI agent to the server
# The agent can use Accept: text/amtp+markdown to get machine-readable docs

# 3. Discover skills
curl -H "Accept: application/json" http://localhost:3099/

# 4. Get a skill's capability contract
curl -H "Accept: text/amtp+markdown" http://localhost:3099/skills/echo

# 5. Execute an action
curl -X POST http://localhost:3099/api/actions/echo/say \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from my agent!"}'
```
