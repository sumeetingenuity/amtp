/**
 * AMTP Crawler & Indexer
 * Crawls AMTP-enabled websites and builds searchable index
 */

import { AMTPClient } from "../client/amtp-client";
import { AMTPDocument, StructuredData, Link, LinkType, MarkdownNode } from "../types/amtp.types";

/**
 * Crawler Configuration
 */
export interface CrawlerConfig {
  baseUrl: string;
  maxPages?: number;
  maxDepth?: number;
  respectRobotsTxt?: boolean;
  delays?: {
    betweenRequests: number; // ms
    betweenDomains: number; // ms
  };
  userAgent?: string;
  indexCallback?: (doc: AMTPDocument) => Promise<void>;
}

/**
 * Crawled Page Index
 */
export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  structuredData: StructuredData[];
  links: Link[];
  indexedAt: string;
  embeddingVector?: number[];
}

/**
 * Crawler Statistics
 */
export interface CrawlStats {
  totalPages: number;
  totalTime: number; // ms
  avgTimePerPage: number; // ms
  totalLinksDiscovered: number;
  externalLinks: number;
  errors: number;
  startedAt: string;
  completedAt: string;
}

/**
 * AMTP Crawler
 */
export class AMTPCrawler {
  private config: CrawlerConfig;
  private client: AMTPClient;
  private visited: Set<string> = new Set();
  private queue: { url: string; depth: number }[] = [];
  private index: Map<string, CrawledPage> = new Map();
  private stats: CrawlStats;
  private startTime = 0;

  constructor(config: CrawlerConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      maxPages: config.maxPages || 1000,
      maxDepth: config.maxDepth || 5,
      respectRobotsTxt: config.respectRobotsTxt !== false,
      delays: {
        betweenRequests: config.delays?.betweenRequests || 100,
        betweenDomains: config.delays?.betweenDomains || 1000,
      },
      userAgent: config.userAgent || "AMTP-Crawler/1.0",
      indexCallback: config.indexCallback,
    };

    this.client = new AMTPClient({
      baseUrl: this.config.baseUrl,
      capabilities: ["streaming", "pagination"],
    });

    this.stats = {
      totalPages: 0,
      totalTime: 0,
      avgTimePerPage: 0,
      totalLinksDiscovered: 0,
      externalLinks: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      completedAt: "",
    };
  }

  /**
   * Start crawling
   */
  async crawl(): Promise<CrawledPage[]> {
    this.startTime = Date.now();
    console.log(`🕷️  Starting AMTP crawl: ${this.config.baseUrl}`);

    // Check robots.txt if enabled
    if (this.config.respectRobotsTxt) {
      await this.checkRobotsTxt();
    }

    // Initialize queue with root
    this.queue.push({ url: this.config.baseUrl, depth: 0 });

    // Process queue
    while (
      this.queue.length > 0 &&
      (this.visited.size < (this.config.maxPages ?? 1_000))
    ) {
      const item = this.queue.shift();
      if (!item) break;

      await this.crawlPage(item.url, item.depth);
      const delayMs = Math.max(this.crawlDelayMs, this.config.delays?.betweenRequests ?? 100);
      await this.delay(delayMs);
    }

    // Calculate stats
    const endTime = Date.now();
    this.stats.totalTime = endTime - this.startTime;
    this.stats.avgTimePerPage = this.stats.totalPages > 0 
      ? Math.round(this.stats.totalTime / this.stats.totalPages) 
      : 0;
    this.stats.completedAt = new Date().toISOString();

    console.log(`✅ Crawl complete. Pages: ${this.stats.totalPages}`);
    this.printStats();

    return Array.from(this.index.values());
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(url: string, depth: number): Promise<void> {
    // Skip if already visited
    if (this.visited.has(url)) return;
    this.visited.add(url);

    // Skip if depth exceeded
    if (depth > (this.config.maxDepth ?? 5)) return;

    // SECURITY: Respect robots.txt disallow rules
    if (this.config.respectRobotsTxt && this.disallowRules.length > 0 && !this.isAllowedByRobots(url)) {
      console.log(`🚫 Skipping (robots.txt): ${url}`);
      return;
    }

    try {
      console.log(`📄 Crawling [${this.stats.totalPages + 1}] ${url}`);

      const doc = await this.client.getPage(url);

      // Index the page
      const crawledPage: CrawledPage = {
        url,
        title: doc.title,
        content: doc.nodes.map((n: MarkdownNode) => n.content || "").join(" "),
        structuredData: doc.structured_data || [],
        links: doc.links,
        indexedAt: new Date().toISOString(),
      };

      this.index.set(url, crawledPage);
      this.stats.totalPages++;

      // Call index callback if provided
      if (this.config.indexCallback) {
        await this.config.indexCallback(doc);
      }

      // Discover new links
      for (const link of doc.links) {
        if (link.type === LinkType.INTERNAL) {
          const linkedUrl = new URL(link.url, this.config.baseUrl).href;

          if (!this.visited.has(linkedUrl)) {
            this.queue.push({ url: linkedUrl, depth: depth + 1 });
            this.stats.totalLinksDiscovered++;
          }
        } else if (link.type === LinkType.EXTERNAL) {
          this.stats.externalLinks++;
        }
      }
    } catch (error) {
      console.error(`❌ Error crawling ${url}:`, error);
      this.stats.errors++;
    }
  }

  private disallowRules: RegExp[] = [];
  private crawlDelayMs = 0;

  /**
   * Check robots.txt — parse rules and enforce them during crawl.
   */
  private async checkRobotsTxt(): Promise<void> {
    try {
      const robotsUrl = `${this.config.baseUrl}/robots.txt`;
      const response = await fetch(robotsUrl);

      if (!response.ok) {
        console.log("📋 No robots.txt found (continuing)");
        return;
      }

      const content = await response.text();
      console.log("📋 robots.txt found, parsing rules...");

      const userAgent = this.config.userAgent || "AMTP-Crawler/1.0";
      let relevantSection = false;
      const disallows: string[] = [];

      for (const line of content.split("\n")) {
        const trimmed = line.trim();

        if (/^User-agent:\s*/i.test(trimmed)) {
          const agent = trimmed.replace(/^User-agent:\s*/i, "").trim();
          relevantSection = agent === "*" || agent === userAgent;
          continue;
        }

        if (relevantSection && /^Disallow:\s*/i.test(trimmed)) {
          const path = trimmed.replace(/^Disallow:\s*/i, "").trim();
          if (path) {
            disallows.push(path);
          }
        }

        if (relevantSection && /^Crawl-delay:\s*/i.test(trimmed)) {
          const delay = parseInt(trimmed.replace(/^Crawl-delay:\s*/i, "").trim(), 10);
          if (!isNaN(delay) && delay > 0) {
            this.crawlDelayMs = delay * 1000;
          }
        }
      }

      // Convert disallow paths to regex patterns for URL matching
      this.disallowRules = disallows.map((d) => {
        const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
        return new RegExp(`^${escaped}`);
      });

      if (this.disallowRules.length > 0) {
        console.log(`📋 ${disallows.length} disallow rule(s) loaded`);
      }
      if (this.crawlDelayMs > 0) {
        console.log(`📋 Crawl-delay: ${this.crawlDelayMs}ms`);
      }
    } catch (error) {
      console.log("📋 Could not fetch robots.txt (continuing without restrictions)");
    }
  }

  private isAllowedByRobots(url: string): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname + parsed.search;
      for (const rule of this.disallowRules) {
        if (rule.test(path)) return false;
      }
    } catch {
      // If URL is malformed, allow it (crawlPage will handle errors)
    }
    return true;
  }

  /**
   * Search the index
   */
  search(query: string): CrawledPage[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.index.values()).filter(
      (page) =>
        page.title.toLowerCase().includes(lowerQuery) ||
        page.content.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get page by URL
   */
  getPage(url: string): CrawledPage | undefined {
    return this.index.get(url);
  }

  /**
   * Export index as JSON
   */
  exportIndex(): string {
    return JSON.stringify(
      {
        crawledAt: new Date().toISOString(),
        stats: this.stats,
        pages: Array.from(this.index.values()),
      },
      null,
      2
    );
  }

  /**
   * Print crawl statistics
   */
  private printStats(): void {
    console.log("\n📊 Crawl Statistics:");
    console.log(`   Total Pages: ${this.stats.totalPages}`);
    console.log(`   Total Time: ${this.stats.totalTime}ms`);
    console.log(`   Avg Time/Page: ${this.stats.avgTimePerPage}ms`);
    console.log(`   Links Discovered: ${this.stats.totalLinksDiscovered}`);
    console.log(`   External Links: ${this.stats.externalLinks}`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log();
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Search Engine Indexer
 * Example of building a search engine index from AMTP pages
 */
export class SearchIndexer {
  private index: Map<string, CrawledPage[]> = new Map();

  /**
   * Add pages to index
   */
  addPages(pages: CrawledPage[]): void {
    for (const page of pages) {
      // Extract keywords
      const keywords = this.extractKeywords(page.content);

      for (const keyword of keywords) {
        if (!this.index.has(keyword)) {
          this.index.set(keyword, []);
        }
        const entry = this.index.get(keyword);
        if (entry) entry.push(page);
      }
    }
  }

  /**
   * Search index
   */
  search(query: string, limit = 10): CrawledPage[] {
    const keywords = query.toLowerCase().split(" ");
    const results: Map<string, number> = new Map();

    // Count keyword matches
    for (const keyword of keywords) {
      const pages = this.index.get(keyword) || [];
      for (const page of pages) {
        const url = page.url;
        results.set(url, (results.get(url) || 0) + 1);
      }
    }

    // Sort by relevance
    return Array.from(results.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([url]) => {
        // Get page from all pages
        for (const pages of this.index.values()) {
          const page = pages.find((p) => p.url === url);
          if (page) return page;
        }
        throw new Error(`Page ${url} not found`);
      });
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction (production would use NLP)
    return content
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3 && !this.isStopWord(word))
      .slice(0, 50);
  }

  /**
   * Check if word is stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "is",
      "are",
      "was",
      "were",
      "been",
      "be",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
    ]);
    return stopWords.has(word);
  }

  /**
   * Export index
   */
  exportIndex(): string {
    const data: Record<string, string[]> = {};
    for (const [keyword, pages] of this.index) {
      data[keyword] = pages.map((p) => p.url);
    }
    return JSON.stringify(data, null, 2);
  }
}

export default {
  AMTPCrawler,
  SearchIndexer,
};
