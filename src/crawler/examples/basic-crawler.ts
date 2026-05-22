/**
 * Basic AMTP Crawler Example
 *
 * Run with: npm run crawler
 */

import { AMTPCrawler } from "../amtp-crawler.js";

async function main() {
  const crawler = new AMTPCrawler({
    baseUrl: process.env.AMTP_BASE_URL || "http://localhost:3000",
    maxPages: 5,
    maxDepth: 1,
    respectRobotsTxt: false,
    delays: { betweenRequests: 10, betweenDomains: 10 },
  });

  console.log("🕷️  AMTP Crawler Demo — (start server first for results)");

  try {
    const pages = await crawler.crawl();
    console.log(`Crawled ${pages.length} pages`);
    console.log("Crawl stats:", (crawler as any).getStats?.() || "done");
  } catch (err: any) {
    console.log("Demo: server not running? Error:", err.message);
  }
}

main().catch(console.error);
