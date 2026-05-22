/**
 * AMTP Protocol - TypeScript Type Definitions
 * Core types, schemas, and interfaces for the Agent Markdown Transfer Protocol
 */

/* ============================================================================
   CORE TYPES
   ========================================================================== */

/** AMTP Protocol version */
export type AMTPVersion = "1.0" | "1.1" | "2.0";

/** Supported MIME types */
export enum MIMEType {
  AMTP_MARKDOWN = "text/amtp+markdown",
  APP_AMTP_MARKDOWN = "application/amtp+markdown",
  MARKDOWN = "text/markdown",
  HTML = "text/html",
  JSON = "application/json",
  EVENT_STREAM = "text/event-stream",
  FORM_URLENCODED = "application/x-www-form-urlencoded",
}

/** HTTP methods */
export enum HTTPMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
}

/** AMTP Status codes (extend HTTP) */
export enum StatusCode {
  // 2xx Success
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // 3xx Redirection
  MOVED_PERMANENTLY = 301,
  FOUND = 302,
  NOT_MODIFIED = 304,

  // 4xx Client Error
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // 5xx Server Error
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

/* ============================================================================
   REQUEST TYPES
   ========================================================================== */

/** AMTP Request headers */
export interface AMTPRequestHeaders {
  accept?: string;
  "user-agent"?: string;
  "x-amtp-capabilities"?: string;
  "x-session-id"?: string;
  "x-agent-identity"?: string;
  "x-agent-context"?: string;
  authorization?: string;
  [key: string]: string | undefined;
}

/** Supported AMTP capabilities */
export enum AgentCapability {
  ACTIONS = "actions",
  STREAMING = "streaming",
  FORMS = "forms",
  TOOLS = "tools",
  MULTIMODAL = "multimodal",
  PAGINATION = "pagination",
  SESSIONS = "sessions",
  FILE_UPLOAD = "file_upload",
}

/** AMTP GET request for page */
export interface AMTPPageRequest {
  path: string;
  headers: AMTPRequestHeaders;
  query?: Record<string, string | string[]>;
  sessionId?: string;
  capabilities?: AgentCapability[];
}

/** AMTP action invocation request */
export interface AMTPActionRequest {
  action: string;
  parameters?: Record<string, unknown>;
  sessionId: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/* ============================================================================
   RESPONSE TYPES
   ========================================================================== */

/** AMTP Response headers */
export interface AMTPResponseHeaders {
  "content-type": MIMEType;
  "x-amtp-version": AMTPVersion;
  "x-session-id"?: string;
  "cache-control"?: string;
  etag?: string;
  "x-amtp-next-action"?: string;
  [key: string]: string | undefined;
}

/** Successful response wrapper */
export interface AMTPSuccessResponse<T = unknown> {
  status: "success";
  data?: T;
  metadata?: Record<string, unknown>;
  headers?: AMTPResponseHeaders;
}

/** Error response wrapper */
export interface AMTPErrorResponse {
  status: "error";
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
    timestamp?: string;
  };
}

/** AMTP Response (union of success/error) */
export type AMTPResponse<T = unknown> =
  | AMTPSuccessResponse<T>
  | AMTPErrorResponse;

/* ============================================================================
   MARKDOWN DOCUMENT TYPES
   ========================================================================== */

/** Markdown AST node types */
export enum MarkdownNodeType {
  DOCUMENT = "document",
  HEADING = "heading",
  PARAGRAPH = "paragraph",
  BLOCKQUOTE = "blockquote",
  LIST = "list",
  LIST_ITEM = "list_item",
  CODE_BLOCK = "code_block",
  INLINE_CODE = "inline_code",
  BOLD = "bold",
  ITALIC = "italic",
  LINK = "link",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  TABLE = "table",
  THEMATIC_BREAK = "thematic_break",
  ACTION = "action",
  FORM = "form",
  METADATA = "metadata",
  STRUCTURED_DATA = "structured_data",
}

/** Markdown AST node */
export interface MarkdownNode {
  type: MarkdownNodeType;
  children?: MarkdownNode[];
  content?: string;
  url?: string;
  alt?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  /** Agent-facing description extracted from associated amtp-meta block */
  description?: string;
  /** For multimedia: image | video | audio (future) */
  mediaType?: 'image' | 'video' | 'audio';
}

/** Parsed AMTP markdown document */
export interface AMTPDocument {
  type: "document";
  version: AMTPVersion;
  title: string;
  path: string;
  nodes: MarkdownNode[];
  actions: Action[];
  forms: Form[];
  links: Link[];
  metadata: DocumentMetadata;
  structured_data?: StructuredData[];
  /** Pagination information for this document (if the content is paginated) */
  pagination?: Pagination;
  /** Declared permissions for this document or resource (v2.0) */
  permissions?: Permission[];
  /** Access policies binding permissions to roles/conditions (v2.0) */
  policies?: Policy[];
  /** Declared skills (bundled capabilities) for this document (v2.0) */
  skills?: Skill[];
}

/** Document metadata */
export interface DocumentMetadata {
  pageId?: string;
  pageType?: string;
  version?: string;
  updatedAt?: string;
  cacheControl?: string;
  sessionRequired?: boolean;
  [key: string]: unknown;
}

/* ============================================================================
   ACTION TYPES
   ========================================================================== */

/** Parameter types for actions */
export enum ParameterType {
  STRING = "string",
  NUMBER = "number",
  INTEGER = "integer",
  BOOLEAN = "boolean",
  EMAIL = "email",
  URL = "url",
  DATE = "date",
  DATETIME = "datetime",
  PHONE = "phone",
  ENUM = "enum",
  OBJECT = "object",
  ARRAY = "array",
  FILE = "file",
}

/** Action parameter schema */
export interface ActionParameter {
  name: string;
  type: ParameterType;
  required?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: string;
  validation?: Record<string, unknown>;
}

/** Action definition */
export interface Action {
  id: string;
  label?: string;
  description?: string;
  method: HTTPMethod;
  endpoint: string;
  parameters?: ActionParameter[];
  requiresAuthentication?: boolean;
  idempotent?: boolean;
  timeoutMs?: number;
  expectedOutcomes?: string[];
  rateLimit?: RateLimit;
  permissions?: string[];
}

/** Rate limiting configuration */
export interface RateLimit {
  requests: number;
  window: "second" | "minute" | "hour" | "day";
  burst?: number;
}

/** Action invocation result */
export interface ActionResult {
  actionId: string;
  status: "success" | "error";
  result?: Record<string, unknown>;
  nextActions?: string[];
  redirectTo?: string;
  error?: {
    code: string;
    message: string;
  };
}

/* ============================================================================
   PERMISSION, POLICY & SKILL TYPES (v2.0)
   First-class protocol primitives for capability-based access control.
   ========================================================================== */

/**
 * A permission grants the bearer the right to perform a set of actions
 * on a specific resource, optionally under constraints.
 */
export interface Permission {
  id: string;
  name: string;
  description?: string;
  /** Resource pattern this permission governs (e.g. "workspace:*", "order:read") */
  resource: string;
  /** Action IDs this permission allows on the resource */
  actions: string[];
  /** Optional constraints that narrow when the permission applies */
  constraints?: Record<string, unknown>;
}

/**
 * A policy binds a set of permissions to roles and optionally to conditions.
 * Policies are evaluated at action-execution time.
 */
export interface Policy {
  id: string;
  name: string;
  description?: string;
  /** Permission IDs this policy grants */
  permissions: string[];
  /** Roles that receive this policy. Empty means all authenticated sessions. */
  roles?: string[];
  /** Conditions that must be satisfied for this policy to apply */
  conditions?: PolicyCondition[];
  /** Higher priority policies override lower ones (default 0) */
  priority?: number;
}

/** Condition expression inside a policy */
export interface PolicyCondition {
  field: string;
  operator: "eq" | "neq" | "in" | "gt" | "lt" | "contains" | "exists";
  value?: unknown;
}

/**
 * A skill bundles actions, permissions, and dependencies into a named
 * capability group that an agent can request or a server can advertise.
 */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  /** Action IDs this skill includes */
  actions: string[];
  /** Permission IDs this skill requires or grants */
  permissions?: string[];
  /** IDs of skills that must be acquired first */
  requires?: string[];
  /** Arbitrary metadata (pricing, reputation, etc.) */
  metadata?: Record<string, unknown>;
}

/* ============================================================================
   BATCH ACTION TYPES (v1.1)
   ========================================================================== */

/**
 * Recommended Batch Endpoint Pattern:
 *
 *   POST /api/amtp/batch
 *   Content-Type: application/json
 *   Body: AMTPBatchRequest
 *
 * Response:
 *   200 OK with AMTPBatchResponse (even for partial failures)
 *   4xx/5xx only for transport-level errors
 *
 * Semantics:
 * - Each item has a client-generated `requestId` for correlation in results.
 * - `batchId` can be used for idempotency (server should dedup if same batchId + session).
 * - `options.atomic` requests all-or-nothing behavior (server may ignore if not supported).
 * - `options.continueOnError` allows partial success.
 *
 * Error codes in top-level error or per-result:
 *   BATCH_PARTIAL, BATCH_ATOMIC_FAILED, ACTION_INVALID, etc.
 */

/** Single item in a batch action request */
export interface BatchActionItem {
  /** Client-provided ID for correlating request and response */
  requestId: string;
  action: string;
  parameters?: Record<string, unknown>;
}

/** Request to execute multiple actions in one call */
export interface AMTPBatchRequest {
  /** Optional server-generated or client-provided batch identifier */
  batchId?: string;
  actions: BatchActionItem[];
  options?: {
    /** If true, all actions must succeed or the entire batch is rolled back (if supported by server) */
    atomic?: boolean;
    /** Continue processing remaining actions even if some fail */
    continueOnError?: boolean;
    /** Maximum time for the entire batch */
    timeoutMs?: number;
  };
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** Response from a batch action execution */
export interface AMTPBatchResponse {
  batchId?: string;
  /** Overall status of the batch */
  status: 'success' | 'partial' | 'failed';
  /** Individual results in the same order as the request */
  results: ActionResult[];
  error?: {
    code: string;
    message: string;
    /** List of requestIds that failed (when partial or failed) */
    failedRequestIds?: string[];
  };
  metadata?: Record<string, unknown>;
}

/* ============================================================================
   FORM TYPES
   ========================================================================== */

/** Form field types */
export enum FormFieldType {
  TEXT = "text",
  EMAIL = "email",
  PASSWORD = "password",
  NUMBER = "number",
  CHECKBOX = "checkbox",
  RADIO = "radio",
  SELECT = "select",
  TEXTAREA = "textarea",
  FILE = "file",
  DATE = "date",
  TIME = "time",
  DATETIME = "datetime",
  HIDDEN = "hidden",
}

/** Form field definition */
export interface FormField {
  name: string;
  type: FormFieldType;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: FormOption[];
  validation?: FieldValidation;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  multiple?: boolean;
  accept?: string; // for file fields
}

/** Form option (for select, radio) */
export interface FormOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Field validation rule */
export interface FieldValidation {
  type: "email" | "url" | "phone" | "pattern" | "custom";
  pattern?: string;
  message?: string;
  [key: string]: unknown;
}

/** Form definition */
export interface Form {
  id: string;
  action: string;
  method: HTTPMethod;
  endpoint: string;
  label?: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  cancelLabel?: string;
  multipart?: boolean;
  csrfToken?: string;
}

/** Form submission */
export interface FormSubmission {
  formId: string;
  values: Record<string, unknown>;
  sessionId?: string;
  requestId?: string;
}

/* ============================================================================
   NAVIGATION & LINKS
   ========================================================================== */

/** Link types */
export enum LinkType {
  INTERNAL = "internal",
  EXTERNAL = "external",
  ACTION = "action",
  NAVIGATION = "navigation",
}

/** Link definition */
export interface Link {
  text: string;
  url: string;
  type: LinkType;
  title?: string;
  method?: HTTPMethod;
  data?: Record<string, unknown>;
}

/** Cursor for cursor-based pagination (preferred for agents) */
export interface Cursor {
  value: string;
  /** Direction for bidirectional cursors */
  direction?: 'forward' | 'backward';
}

/** Modern page info (GraphQL-inspired but lightweight) */
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
  /** Total count is optional because counting can be expensive on large datasets */
  totalCount?: number;
}

/** Pagination metadata — supports both simple page-based and advanced cursor-based */
export interface Pagination {
  // === Simple / legacy page-based pagination ===
  currentPage?: number;
  totalPages?: number;
  itemsPerPage?: number;
  totalItems?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  nextUrl?: string;
  previousUrl?: string;

  // === Modern cursor-based pagination (recommended for AMTP agents) ===
  pageInfo?: PageInfo;
  nextCursor?: string;
  previousCursor?: string;
  /** The cursor that was used to fetch this page */
  currentCursor?: string;
}

/* ============================================================================
   SESSION & AUTHENTICATION
   ========================================================================== */

/** Authentication method */
export enum AuthMethod {
  SESSION_TOKEN = "session_token",
  BEARER_TOKEN = "bearer_token",
  JWT = "jwt",
  API_KEY = "api_key",
  BASIC = "basic",
}

/** Session data */
export interface Session {
  sessionId: string;
  userId?: string;
  username?: string;
  email?: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  capabilities: string[];
  permissions: string[];
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Login request */
export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

/** Login response */
export interface LoginResponse {
  sessionId: string;
  userId: string;
  username: string;
  expiresAt: string;
  capabilities: string[];
  preferences?: Record<string, unknown>;
}

/* ============================================================================
   STREAMING TYPES
   ========================================================================== */

/** Server-sent event */
export interface ServerSentEvent {
  event: string;
  data: Record<string, unknown>;
  id?: string;
  retry?: number;
}

/** Streaming update types */
export enum StreamUpdateType {
  PAGE_UPDATE = "page_update",
  ITEM_ADDED = "item_added",
  ITEM_REMOVED = "item_removed",
  ITEM_UPDATED = "item_updated",
  PRICE_CHANGED = "price_changed",
  STOCK_CHANGED = "stock_changed",
  STATUS_CHANGED = "status_changed",
  ERROR = "error",
  COMPLETED = "completed",
}

/** Streaming update */
export interface StreamUpdate {
  type: StreamUpdateType;
  data: Record<string, unknown>;
  timestamp: string;
}

/* ============================================================================
   PUSH NOTIFICATIONS (v2.0) - Webhooks + SSE
   ========================================================================== */

/** Types of events that can trigger notifications */
export enum NotificationEventType {
  ORDER_UPDATED = "order.updated",
  ORDER_SHIPPED = "order.shipped",
  NEW_MESSAGE = "message.new",
  WORKSPACE_UPDATED = "workspace.updated",
  ITEM_PRICE_CHANGED = "item.price_changed",
  SESSION_EXPIRED = "session.expired",
  ACTION_REQUIRED = "action.required",
}

/** Payload for a notification event (used in both SSE and webhooks) */
export interface NotificationEvent {
  id: string;
  type: NotificationEventType | string;
  timestamp: string;
  /** The main payload (e.g. order details, message, etc.) */
  data: Record<string, unknown>;
  /** Optional metadata (sessionId, userId, etc.) */
  metadata?: Record<string, unknown>;
}

/** Webhook subscription registered by an agent */
export interface WebhookSubscription {
  id: string;
  /** URL the server will POST events to */
  url: string;
  /** List of event types this webhook cares about */
  events: Array<NotificationEventType | string>;
  /** Secret used by server to sign the payload (HMAC-SHA256) */
  secret?: string;
  createdAt: string;
  active: boolean;
  /** Optional description for the agent */
  description?: string;
}

/** Request to register a new webhook */
export interface RegisterWebhookRequest {
  url: string;
  events: Array<NotificationEventType | string>;
  secret?: string;
  description?: string;
}

/** Response after registering a webhook */
export interface RegisterWebhookResponse {
  subscription: WebhookSubscription;
  /** Example curl to test the webhook */
  testCommand?: string;
}

/* ============================================================================
   STRUCTURED DATA
   ========================================================================== */

/** Structured data type */
export type StructuredDataType =
  | "Product"
  | "Event"
  | "Person"
  | "Organization"
  | "LocalBusiness"
  | "Article"
  | "BlogPosting"
  | "Review"
  | "AggregateRating"
  | "Offer"
  | "Order"
  | "Invoice"
  | "Unknown";

/** Structured data */
export interface StructuredData {
  "@context"?: string;
  "@type": StructuredDataType;
  name?: string;
  description?: string;
  url?: string;
  image?: string;
  [key: string]: unknown;
}

/* ============================================================================
   ERROR TYPES
   ========================================================================== */

/** Error codes */
export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTH_REQUIRED = "AUTH_REQUIRED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  INVALID_REQUEST = "INVALID_REQUEST",
  RATE_LIMITED = "RATE_LIMITED",
  SERVER_ERROR = "SERVER_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  CONFLICT = "CONFLICT",
  INVALID_STATE = "INVALID_STATE",
}

/** Error detail */
export interface ErrorDetail {
  field?: string;
  code: ErrorCode;
  message: string;
  suggestion?: string;
}

/** AMTP Error */
export class AMTPError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: StatusCode = StatusCode.BAD_REQUEST,
    public details?: ErrorDetail[]
  ) {
    super(message);
    this.name = "AMTPError";
  }
}

/* ============================================================================
   UTILITY TYPES
   ========================================================================== */

/** Page request options */
export interface PageRequestOptions {
  sessionId?: string;
  capabilities?: AgentCapability[];
  headers?: Record<string, string>;
  query?: Record<string, string | string[]>;
}

/** Page response options */
export interface PageResponseOptions {
  cacheControl?: string;
  etag?: string;
  sessionId?: string;
  nextAction?: string;
}

/** Middleware context */
export interface AMTPContext {
  request: AMTPPageRequest;
  response: {
    statusCode: StatusCode;
    headers: AMTPResponseHeaders;
    body?: AMTPDocument | string;
  };
  session?: Session;
  user?: { id: string; username: string; [key: string]: unknown };
  state: Record<string, unknown>;
  /** Permissions resolved for the current session against the current document (v2.0) */
  resolvedPermissions?: string[];
}

/** Middleware function */
export type AMTPMiddleware = (
  context: AMTPContext,
  next: () => Promise<void>
) => Promise<void>;

/** Handler function */
export type AMTPHandler = (
  request: AMTPPageRequest
) => Promise<AMTPDocument | string>;

/** Content negotiation result */
export interface ContentNegotiation {
  mimeType: MIMEType;
  quality: number;
  charSet?: string;
}

/* ============================================================================
   AMTP-QL (Query Language) — v2.0
   Lightweight GraphQL-subset for projecting AMTPDocument subsets
   ========================================================================== */

/** Raw AMTP-QL query string (GraphQL-inspired) */
export interface AMTPQLQuery {
  raw: string;
  variables?: Record<string, unknown>;
}

/** Result of executing an AMTP-QL query (projected document parts) */
export interface AMTPQLResult {
  title?: string;
  path?: string;
  version?: string;
  metadata?: Partial<DocumentMetadata>;
  pagination?: Pagination;
  actions?: Array<Pick<Action, 'id' | 'description' | 'parameters'>>;
  forms?: Array<Pick<Form, 'id' | 'fields'>>;
  links?: Array<Pick<Link, 'text' | 'url' | 'type'>>;
  structured_data?: StructuredData[];
  nodes?: Array<Partial<MarkdownNode> & { type: MarkdownNodeType }>;
  permissions?: Permission[];
  policies?: Policy[];
  skills?: Skill[];
}

/** Server request for /api/amtp/query */
export interface AMTPQLQueryRequest {
  query: string;
  variables?: Record<string, unknown>;
}

/** Server response for AMTP-QL (data or errors) */
export interface AMTPQLQueryResponse {
  data?: AMTPQLResult;
  errors?: Array<{
    message: string;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
}

/** Parsed internal representation (for parser/executor) */
export interface AMTPQLSelection {
  field: string;
  arguments?: Record<string, unknown>;
  selections?: AMTPQLSelection[];
}

export interface AMTPQLParsedQuery {
  selections: AMTPQLSelection[];
}

export default {
  MIMEType,
  HTTPMethod,
  StatusCode,
  AgentCapability,
  MarkdownNodeType,
  ParameterType,
  FormFieldType,
  LinkType,
  AuthMethod,
  StreamUpdateType,
  ErrorCode,
};
