/**
 * AMTP Notifications - Webhook + SSE Push Model (v2.0)
 *
 * Provides real-time push notifications to agents via:
 * - Server-Sent Events (SSE) for long-lived connections
 * - Webhooks for fire-and-forget delivery
 *
 * Security:
 * - Webhooks are signed with HMAC-SHA256 using a per-subscription secret
 * - Agents should verify the signature on every webhook call
 */

import { EventEmitter } from "events";
import crypto from "crypto";
import { NotificationEvent, WebhookSubscription, RegisterWebhookRequest } from "../types/amtp.types";

const WEBHOOK_SIGNATURE_HEADER = "X-AMTP-Signature";
const WEBHOOK_TIMESTAMP_HEADER = "X-AMTP-Timestamp";

/**
 * Simple in-memory event bus for AMTP notifications.
 * In production, replace with Redis / NATS / etc.
 */
export class NotificationBus extends EventEmitter {
  private webhooks: Map<string, WebhookSubscription> = new Map();
  private sseClients: Map<string, Set<(event: NotificationEvent) => void>> = new Map();

  /**
   * Emit an event to all subscribers (SSE + Webhooks)
   */
  emitEvent(event: NotificationEvent): void {
    // 1. Notify SSE clients
    const listeners = this.sseClients.get(event.type) || new Set();
    listeners.forEach((send) => {
      try {
        send(event);
      } catch (err) {
        // client disconnected, will be cleaned up on close
      }
    });

    // 2. Deliver to webhooks
    this.deliverToWebhooks(event);
  }

  /**
   * Register a new webhook subscription
   */
  registerWebhook(req: RegisterWebhookRequest): WebhookSubscription {
    const id = `wh_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const sub: WebhookSubscription = {
      id,
      url: req.url,
      events: req.events,
      secret: req.secret,
      createdAt: new Date().toISOString(),
      active: true,
      description: req.description,
    };
    this.webhooks.set(id, sub);
    return sub;
  }

  getWebhook(id: string): WebhookSubscription | undefined {
    return this.webhooks.get(id);
  }

  listWebhooks(): WebhookSubscription[] {
    return Array.from(this.webhooks.values());
  }

  deleteWebhook(id: string): boolean {
    return this.webhooks.delete(id);
  }

  /**
   * Subscribe an SSE client to specific event types
   */
  subscribeSSE(types: string[], send: (event: NotificationEvent) => void): () => void {
    const unsubs: Array<() => void> = [];

    types.forEach((type) => {
      const existing = this.sseClients.get(type);
      const set = existing ?? new Set();
      if (!existing) {
        this.sseClients.set(type, set);
      }
      set.add(send);

      unsubs.push(() => {
        set.delete(send);
        if (set.size === 0) this.sseClients.delete(type);
      });
    });

    return () => unsubs.forEach((fn) => fn());
  }

  private async deliverToWebhooks(event: NotificationEvent) {
    const deliveries = Array.from(this.webhooks.values())
      .filter((sub) => sub.active && sub.events.some((e) => e === event.type || e === "*"))
      .map(async (sub) => {
        try {
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const payload = JSON.stringify(event);
          const signature = this.signPayload(payload, timestamp, sub.secret);

          const res = await fetch(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [WEBHOOK_SIGNATURE_HEADER]: signature,
              [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
              "User-Agent": "AMTP-Webhook/1.1",
            },
            body: payload,
            // In real impl: add timeout, retries, dead letter queue
          });

          if (!res.ok) {
            console.warn(`[AMTP Webhook] Delivery failed to ${sub.url}: ${res.status}`);
          }
        } catch (err) {
          console.error(`[AMTP Webhook] Error delivering to ${sub.url}:`, err);
        }
      });

    await Promise.allSettled(deliveries);
  }

  private signPayload(payload: string, timestamp: string, secret?: string): string {
    if (!secret) return "";
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(`${timestamp}.${payload}`);
    return `sha256=${hmac.digest("hex")}`;
  }
}

// Singleton for the reference implementation
export const notificationBus = new NotificationBus();
