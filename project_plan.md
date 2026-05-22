Create a production-grade specification and prototype for an “Agent Native Web Layer” called AMTP (Agent Markdown Transfer Protocol) — a semantic, markdown-first interaction layer for AI agents and headless browsers that runs on top of HTTP.

The goal is to create a machine-first alternative to traditional HTML rendering while remaining fully compatible with existing web infrastructure.

The system should allow AI agents to:

read webpages as semantic markdown
navigate links
perform actions
fill forms
scroll paginated content
authenticate sessions
execute workflows
understand state
consume structured data efficiently

without requiring a full DOM renderer, browser engine, CSS engine, or JavaScript execution.

The protocol should prioritize:

token efficiency
low latency
semantic clarity
deterministic structure
human readability
agent interoperability
streaming compatibility
backward compatibility with HTTP

The entire architecture should be markdown-native instead of HTML-native.

CORE CONCEPT

AMTP works as an overlay protocol over HTTP.

Clients send:

Accept: text/amtp+markdown

or:

Accept: text/markdown

Servers return semantic markdown pages optimized for LLMs and agents.

The protocol should support:

navigation
actions
forms
state
sessions
pagination
tool execution
structured metadata
streaming updates

Think of it as:

HTTP + Markdown + Hypermedia + Agent Actions
a machine-first web
an agent-native semantic browsing protocol
DELIVERABLES

Generate ALL of the following:

Full protocol specification
Request/response examples
Markdown page grammar
Action system design
Session/authentication design
Hypermedia navigation model
Pagination/scroll model
Tool invocation design
Streaming protocol design
Error handling model
Security architecture
SEO implications for AI crawlers
Comparison with:
HTTP
HTML
JSON APIs
GraphQL
MCP
browser automation
Full reference architecture
Example server implementation
Example client/agent implementation
Example crawler/indexer implementation
Example ecommerce page
Example SaaS dashboard page
Example search engine integration
Example AI agent workflow
Recommended MIME types
Content negotiation flow
Agent capability negotiation
Human rendering compatibility
CDN/cache compatibility
Rate limiting model
Multi-agent interaction model
AI-specific SEO standard
Future roadmap
PROTOCOL REQUIREMENTS

Design the protocol around these ideas:

MARKDOWN-FIRST

Pages are markdown documents, not HTML.

Example:

Product

Name: MacBook Pro
Price: $1999

Actions
[buy]
[add_to_cart]
Links
/reviews
/checkout

The markdown should be:

readable by humans
token efficient for LLMs
structurally deterministic
semantically hierarchical
ACTION-NATIVE

Agents should not click DOM nodes.

Instead expose semantic actions:

ACTION:add_to_cart
ACTION:checkout
ACTION:submit_form

Actions should support:

parameters
schemas
authentication
permissions
expected outcomes
idempotency
transactional behavior
HYPERMEDIA NAVIGATION

Navigation should behave like linked semantic documents.

Support:

links
forms
workflows
redirects
state transitions
SESSION-AWARE

Support:

sessions
authentication
agent identity
persistent workflows
conversation continuity
STREAMING SUPPORT

Support streaming markdown updates over:

SSE
WebSockets
HTTP streams
AGENT NEGOTIATION

Agents should declare capabilities such as:

supports_actions
supports_streaming
supports_tools
supports_forms
supports_multimodal
AI SEO

Design an “AI SEO” layer that allows websites to expose:

semantic summaries
embeddings
structured entity maps
canonical knowledge blocks
action manifests
trusted citations
source provenance
HUMAN + AGENT COEXISTENCE

The same website should support:

traditional browsers
AI agents
headless crawlers

through content negotiation.

EXAMPLE FEATURES

Include examples of:

ecommerce checkout
airline booking
SaaS dashboard navigation
legal document retrieval
AI search engine indexing
autonomous shopping agent
autonomous research agent
TECH STACK

Use:

Node.js
TypeScript
Express or Fastify
Markdown parser
WebSocket support
Example SDK
Example middleware
Example crawler
Example cache layer

Provide:

folder structure
API design
protocol parser
renderer
middleware architecture
TypeScript interfaces
example schemas
SDK examples
IMPORTANT DESIGN GOALS

The protocol should:

reduce token consumption for LLMs
reduce latency vs browser automation
eliminate unnecessary rendering
simplify agent browsing
preserve hypermedia philosophy
remain decentralized
remain HTTP-compatible
be easy for websites to adopt incrementally
OUTPUT STYLE

Write the output like:

a real RFC
a startup technical whitepaper
an engineering architecture document
an open internet standard proposal

Include:

diagrams
request flows
schemas
examples
protocol grammar
implementation examples
production considerations

The result should feel like:
“HTTP for the Agentic Web.”