/**
 * AMTP Agent Client SDK
 * TypeScript SDK for AI agents to interact with AMTP servers
 */

import crypto from "crypto";
import {
  AMTPPageRequest,
  AMTPActionRequest,
  AMTPDocument,
  Action,
  Form,
  FormSubmission,
  Session,
  ServerSentEvent,
  StreamUpdate,
  StatusCode,
  HTTPMethod,
  MarkdownNode,
  AMTPBatchRequest,
  AMTPBatchResponse,
  AMTPQLQueryRequest,
  AMTPQLQueryResponse,
  AMTPQLResult,
} from "../types/amtp.types";

/**
 * AMTP Client Configuration
 */
export interface AMTPClientConfig {
  baseUrl: string;
  sessionId?: string;
  timeout?: number;
  maxRetries?: number;
  capabilities?: string[];
}

/**
 * AMTP Agent Client
 * Main client for agents to interact with AMTP servers
 */
export class AMTPClient {
  private baseUrl: string;
  private sessionId?: string;
  private timeout: number;
  private maxRetries: number;
  private capabilities: string[];

  constructor(config: AMTPClientConfig) {
    this.baseUrl = config.baseUrl;
    this.sessionId = config.sessionId;
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.capabilities = config.capabilities || [
      "actions",
      "streaming",
      "forms",
    ];
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Fetch a page (supports cursor-based pagination)
   */
  async getPage(path: string, options?: { cursor?: string }): Promise<AMTPDocument> {
    let url = `${this.baseUrl}${path}`;

    if (options?.cursor) {
      const separator = path.includes('?') ? '&' : '?';
      url += `${separator}cursor=${encodeURIComponent(options.cursor)}`;
    }

    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (response.status !== StatusCode.OK) {
      throw new Error(
        `Failed to fetch page: ${response.status} ${response.statusText}`
      );
    }

    const markdown = await response.text();
    const parser = new AMTPMarkdownParser();
    return parser.parse(markdown, path);
  }

  /**
   * Convenience method: fetch the next page using the pagination info from the current document.
   * Returns null if there is no next page/cursor.
   */
  async getNextPage(currentDoc: AMTPDocument): Promise<AMTPDocument | null> {
    const pagination = currentDoc.pagination;
    if (!pagination) return null;

    const nextCursor = pagination.nextCursor || pagination.pageInfo?.endCursor;
    if (!nextCursor) return null;

    // Try to extract base path from the document
    const basePath = currentDoc.path || '/';
    return this.getPage(basePath, { cursor: nextCursor });
  }

  /**
   * Extract all media nodes (images, video, audio) from a document.
   * These now include rich `description` from amtp-meta blocks for agents.
   */
  getMedia(doc: AMTPDocument): MarkdownNode[] {
    return doc.nodes.filter(
      (n) => n.type === "image" || n.type === "video" || n.type === "audio"
    );
  }

  /**
   * Execute an action
   */
  async executeAction(
    action: string,
    parameters?: Record<string, unknown>
  ): Promise<any> {
    const url = `${this.baseUrl}/api/amtp/action`;

    const request: AMTPActionRequest = {
      action,
      parameters,
      sessionId: this.sessionId || "",
      requestId: this.generateRequestId(),
    };

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(request),
    });

    return response.json();
  }

  /**
   * Execute multiple actions in a single batch request (v1.1).
   * See AMTPBatchRequest for options (atomic, continueOnError, etc.).
   */
  async executeBatch(
    actions: Array<{ action: string; parameters?: Record<string, unknown> }>,
    options?: AMTPBatchRequest['options']
  ): Promise<AMTPBatchResponse> {
    const url = `${this.baseUrl}/api/amtp/batch`;

    const items = actions.map((a, index) => ({
      requestId: `batch_${this.generateRequestId()}_${index}`,
      action: a.action,
      parameters: a.parameters,
    }));

    const request: AMTPBatchRequest = {
      actions: items,
      options,
      sessionId: this.sessionId,
      metadata: {},
    };

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(request),
    });

    if (response.status >= 400) {
      throw new Error(`Batch request failed: ${response.status}`);
    }

    return response.json() as Promise<AMTPBatchResponse>;
  }

  /**
   * Execute an AMTP-QL query (v2.0) against the current document context.
   * Returns the projected result (much smaller than full document).
   */
  async query(rawQuery: string, variables?: Record<string, unknown>): Promise<AMTPQLResult> {
    const url = `${this.baseUrl}/api/amtp/query`;

    const request: AMTPQLQueryRequest = {
      query: rawQuery,
      variables,
    };

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(request),
    });

    if (response.status >= 400) {
      const err = await response.json().catch(() => ({ error: { message: "" } }));
      throw new Error(`AMTP-QL query failed: ${response.status} ${(err as any)?.error?.message || ""}`);
    }

    const json: AMTPQLQueryResponse = await response.json() as AMTPQLQueryResponse;
    if (json.errors?.length) {
      throw new Error(`AMTP-QL errors: ${json.errors.map(e => e.message).join("; ")}`);
    }
    return json.data || {};
  }

  /**
   * Register a webhook for push notifications (v2.0)
   */
  async registerWebhook(payload: {
    url: string;
    events: string[];
    secret?: string;
    description?: string;
  }): Promise<any> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/webhooks`, {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  /**
   * List registered webhooks
   */
  async listWebhooks(): Promise<any> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/api/webhooks`, {
      headers: this.buildHeaders(),
    });
    return res.json();
  }

  /**
   * Submit a form
   */
  async submitForm(
    form: Form,
    values: Record<string, unknown>
  ): Promise<any> {
    const url = `${this.baseUrl}${form.endpoint}`;

    const submission: FormSubmission = {
      formId: form.id,
      values,
      sessionId: this.sessionId,
      requestId: this.generateRequestId(),
    };

    const response = await this.fetchWithRetry(url, {
      method: form.method,
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify(submission),
    });

    return response.json();
  }

  /**
   * Navigate to a URL
   */
  async navigate(path: string): Promise<AMTPDocument> {
    return this.getPage(path);
  }

  /**
   * Click a link
   */
  async clickLink(url: string): Promise<AMTPDocument> {
    return this.getPage(url);
  }

  /**
   * Login
   */
  async login(
    username: string,
    password: string
  ): Promise<{ sessionId: string; userId: string }> {
    const url = `${this.baseUrl}/api/amtp/login`;

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.buildHeaders("application/json"),
      body: JSON.stringify({ username, password }),
    });

    const data = (await response.json()) as { sessionId: string; userId: string };
    this.sessionId = data.sessionId;
    return data;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    const url = `${this.baseUrl}/api/amtp/logout`;

    await this.fetchWithRetry(url, {
      method: "POST",
      headers: this.buildHeaders(),
    });

    this.sessionId = undefined;
  }

  /**
   * Stream updates from server
   */
  streamUpdates(
    path: string,
    callback: (update: StreamUpdate) => void
  ): EventSource {
    const url = `${this.baseUrl}${path}?sessionId=${this.sessionId}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const update: StreamUpdate = JSON.parse(event.data);
      callback(update);
    };

    return eventSource;
  }

  /**
   * Get available actions on a page
   */
  async getActions(path: string): Promise<Action[]> {
    const doc = await this.getPage(path);
    return doc.actions;
  }

  /**
   * Get available forms on a page
   */
  async getForms(path: string): Promise<Form[]> {
    const doc = await this.getPage(path);
    return doc.forms;
  }

  /**
   * Search page content
   */
  async search(
    query: string,
    limit?: number
  ): Promise<AMTPDocument> {
    const path =
      `/search?q=${encodeURIComponent(query)}` +
      (limit ? `&limit=${limit}` : "");
    return this.getPage(path);
  }

  /**
   * Build request headers
   */
  private buildHeaders(
    contentType?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "text/amtp+markdown",
      "X-AMTP-Capabilities": this.capabilities.join(","),
      "User-Agent": "AMTP-Agent/1.0",
    };

    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    if (this.sessionId) {
      headers["X-Session-ID"] = this.sessionId;
    }

    return headers;
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    attempt = 1
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response;
    } catch (error) {
      if (attempt < this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }
}

/**
 * Simple Markdown Parser for Client
 */
export class AMTPMarkdownParser {
  parse(markdown: string, path: string): AMTPDocument {
    // Simplified parser for client-side use
    const lines = markdown.split("\n");
    const titleMatch = lines[0]?.match(/^# (.+)$/);
    const title = titleMatch?.[1] || "Untitled";

    return {
      type: "document",
      version: "1.0",
      title,
      path,
      nodes: [],
      actions: this.extractActions(markdown),
      forms: this.extractForms(markdown),
      links: this.extractLinks(markdown),
      metadata: {},
    };
  }

  private extractActions(markdown: string): Action[] {
    const actions: Action[] = [];
    const actionRegex = /\[([A-Z_0-9]+)\]/g;
    let match;

    while ((match = actionRegex.exec(markdown)) !== null) {
      const name = match[1];
      actions.push({
        id: name.toLowerCase(),
        label: name,
        method: HTTPMethod.POST,
        endpoint: `/api/actions/${name.toLowerCase()}`,
      });
    }

    return [...new Map(actions.map((a) => [a.id, a])).values()];
  }

  private extractForms(markdown: string): Form[] {
    const forms: Form[] = [];
    const formRegex =
      /ACTION:\s*(\w+)[\s\S]*?METHOD:\s*(\w+)[\s\S]*?ENDPOINT:\s*(\S+)/g;
    let match;

    while ((match = formRegex.exec(markdown)) !== null) {
      const [, name, method, endpoint] = match;
      forms.push({
        id: name,
        action: name,
        method: method.toUpperCase() as any,
        endpoint,
        fields: [],
      });
    }

    return forms;
  }

  private extractLinks(markdown: string): any[] {
    const links: any[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
      const [, text, url] = match;
      links.push({
        text,
        url,
      });
    }

    return links;
  }
}

/**
 * Autonomous Agent Workflow
 * Example of building autonomous workflows
 */
export class AutonomousAgent {
  private client: AMTPClient;

  constructor(config: AMTPClientConfig) {
    this.client = new AMTPClient(config);
  }

  /**
   * Example: Autonomous shopping workflow
   */
  async autonomousShop(
    productQuery: string,
    maxPrice: number
  ): Promise<any> {
    console.log(
      `🤖 Starting autonomous shopping for: ${productQuery} (max: $${maxPrice})`
    );

    try {
      // Step 1: Search for products
      console.log("📍 Step 1: Searching for products...");
      const results = await this.client.search(productQuery, 10);

      // Step 2: Find product within budget (leverage description for better matching in v1.1+)
      const targetProduct = results.actions.find(
        (a) =>
          a.label?.toLowerCase().includes(productQuery.toLowerCase()) ||
          a.description?.toLowerCase().includes(productQuery.toLowerCase())
      );
      if (!targetProduct) {
        throw new Error("Product not found");
      }

      // Step 3: View product
      console.log(
        `📍 Step 2: Viewing product: ${targetProduct.label} — ${targetProduct.description || ""}`
      );
      const product = await this.client.navigate(targetProduct.endpoint || "/");

      // Step 4: Add to cart
      console.log("📍 Step 3: Adding to cart...");
      await this.client.executeAction("add_to_cart", {
        productId: targetProduct.id,
        quantity: 1,
      });

      // Step 5: Navigate to checkout
      console.log("📍 Step 4: Proceeding to checkout...");
      const cart = await this.client.navigate("/cart");

      // Step 6: Get checkout form
      const forms = await this.client.getForms("/checkout");
      console.log(`📍 Step 5: Found ${forms.length} forms`);

      console.log("✅ Workflow completed successfully!");
      return { success: true, product: targetProduct };
    } catch (error) {
      console.error("❌ Workflow failed:", error);
      return { success: false, error };
    }
  }

  /**
   * Example: Multi-step authenticated workflow
   */
  async authenticatedWorkflow(
    username: string,
    password: string
  ): Promise<any> {
    try {
      // Login
      console.log("🔐 Logging in...");
      const session = await this.client.login(username, password);
      console.log(`✅ Logged in as ${session.userId}`);

      // Access dashboard
      console.log("📊 Loading dashboard...");
      const dashboard = await this.client.navigate("/dashboard");

      // Monitor updates
      console.log("🔔 Listening for updates...");
      const eventSource = this.client.streamUpdates("/api/stream/orders", (update) => {
        console.log("📬 Update:", update);
      });

      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Cleanup
      eventSource.close();
      await this.client.logout();
      console.log("✅ Logged out");

      return { success: true };
    } catch (error) {
      console.error("❌ Authenticated workflow failed:", error);
      return { success: false, error };
    }
  }
}

export default {
  AMTPClient,
  AMTPMarkdownParser,
  AutonomousAgent,
};
