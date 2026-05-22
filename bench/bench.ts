/**
 * AMTP Performance Benchmarks
 * Measures:
 *   1. Token efficiency — AMTP Markdown vs HTML for the same content
 *   2. Markdown parser throughput (ops/sec)
 *   3. HTTP request parsing throughput
 *
 * Runs: node bench/bench.js
 */

const { AMTPMarkdownParser } = require("../src/server/markdown-parser");

/* ================================================================
   SAMPLE DOCUMENTS
   ================================================================ */

const AMTP_PRODUCT_PAGE = `# MacBook Pro 14

## Specifications
**Processor:** Apple M4 Pro  
**Memory:** 18 GB  
**Storage:** 512 GB SSD  
**Display:** 14.2" Liquid Retina XDR  
**Battery:** Up to 17 hours  

## Description
The MacBook Pro 14 delivers unprecedented power for demanding workflows.
The M4 Pro chip provides blazing-fast performance whether you're editing
4K video, compiling large codebases, or training machine learning models.

Price: $1999

## Actions
[BUY] — Add to cart and proceed to checkout
[ADD_TO_CART] — Add to cart
[REVIEWS] — Read customer reviews

## Related Products
[MacBook Air 15](/mbp/air-15-lp) — $1299
[iPad Pro 13](/tablets/ipad-pro-13) — $1099

\`\`\`amtp-meta
{"product_id":"mbp-14","category":"laptop","brand":"Apple","in_stock":true}
\`\`\`
`;

const HTML_PRODUCT_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="description" content="MacBook Pro 14 with Apple M4 Pro chip, 18GB RAM, 512GB SSD — $1999"/>
  <meta name="keywords" content="MacBook Pro, Apple, M4 Pro, laptop, computer"/>
  <meta name="robots" content="index, follow"/>
  <link rel="canonical" href="https://store.example.com/products/mbp-14"/>
  <title>MacBook Pro 14 — Store</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;background:#f8f9fa;line-height:1.6}
    nav{background:#0071e3;color:#fff;padding:0 2rem;display:flex;align-items:center;justify-content:space-between;height:56px}
    .nav-brand{font-weight:700;font-size:1.1rem}
    .nav-links{display:flex;gap:1.5rem;font-size:.9rem}
    .nav-links a{color:rgba(255,255,255,.85);text-decoration:none}
    .nav-links a:hover{color:#fff}
    .breadcrumb{padding:1rem 2rem;font-size:.85rem;color:#666;background:#fff;border-bottom:1px solid #eee}
    .product-grid{display:grid;grid-template-columns:1fr 320px;gap:2.5rem;max-width:1200px;margin:2rem auto;padding:0 1.5rem}
    .product-main{background:#fff;border-radius:12px;padding:2rem}
    .product-main h1{font-size:2rem;font-weight:700;margin-bottom:.5rem}
    .price{font-size:1.75rem;font-weight:700;color:#0071e3;margin-bottom:1.5rem}
    .specs{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:2rem}
    .spec-item{background:#f8f9fa;border-radius:8px;padding:.75rem 1rem}
    .spec-label{font-size:.75rem;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.05em}
    .spec-value{font-size:1rem;font-weight:500;margin-top:.25rem}
    .actions{display:flex;gap:1rem;margin-top:1.5rem}
    .btn{display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.5rem;border-radius:8px;font-size:1rem;font-weight:600;text-decoration:none;border:none;cursor:pointer}
    .btn-primary{background:#0071e3;color:#fff}
    .btn-secondary{background:#e8f4ff;color:#0071e3}
    .sidebar{background:#fff;border-radius:12px;padding:1.5rem;height:fit-content}
    .sidebar h3{font-size:.95rem;font-weight:600;margin-bottom:1rem}
    .related-item{display:flex;gap:.75rem;align-items:center;padding:.75rem 0;border-bottom:1px solid #f0f0f0}
    .related-item:last-child{border-bottom:none}
    .placeholder-img{width:64px;height:64px;border-radius:8px;background:linear-gradient(135deg,#ec4899,#8b5cf6)}
    footer{text-align:center;padding:2rem;color:#666;font-size:.85rem;background:#fff;margin-top:3rem;border-top:1px solid #eee}
    @media(max-width:768px){.product-grid{grid-template-columns:1fr}.specs{grid-template-columns:1fr}}
  </style>
</head>
<body>
<nav>
  <div class="nav-brand">TechStore</div>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/products">Products</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </div>
</nav>
<div class="breadcrumb">
  <a href="/">Home</a>
  <span> / </span>
  <a href="/products">Products</a>
  <span> / </span>
  MacBook Pro 14
</div>
<main class="product-grid">
  <div class="product-main">
    <h1>MacBook Pro 14</h1>
    <p class="price">$1,999.00</p>
    <div class="specs">
      <div class="spec-item"><div class="spec-label">Processor</div><div class="spec-value">Apple M4 Pro</div></div>
      <div class="spec-item"><div class="spec-label">Memory</div><div class="spec-value">18 GB</div></div>
      <div class="spec-item"><div class="spec-label">Storage</div><div class="spec-value">512 GB SSD</div></div>
      <div class="spec-item"><div class="spec-label">Display</div><div class="spec-value">14.2" Liquid Retina XDR</div></div>
      <div class="spec-item"><div class="spec-label">Battery</div><div class="spec-value">Up to 17 hours</div></div>
    </div>
    <p>The MacBook Pro 14 delivers unprecedented power for demanding workflows.
    The M4 Pro chip provides blazing-fast performance whether you're editing
    4K video, compiling large codebases, or training machine learning models.</p>
    <div class="actions">
      <button class="btn btn-primary" data-action="add_to_cart">Add to Cart — $1,999</button>
      <button class="btn btn-secondary" data-action="reviews">Read Reviews</button>
    </div>
  </div>
  <aside class="sidebar">
    <h3>Related Products</h3>
    <a href="/products/mbp-air-15" class="related-item">
      <div class="placeholder-img"></div>
      <div><strong>MacBook Air 15</strong><br/>$1,299</div>
    </a>
    <a href="/products/ipad-pro-13" class="related-item">
      <div class="placeholder-img"></div>
      <div><strong>iPad Pro 13</strong><br/>$1,099</div>
    </a>
  </aside>
</main>
<footer>
  &copy; 2026 TechStore. All rights reserved. | <a href="#">Privacy</a> |
  <a href="#">Terms</a> | <a href="#">Accessibility</a>
</footer>
</body>
</html>
`;

/* ================================================================
   HELPERS
   ================================================================ */

function estimateTokens(text: string): number {
  // Rough token count — OECD approx: 4 chars per English token
  return Math.ceil(text.length / 4);
}

/* ================================================================
   BENCHMARK 1 — TOKEN EFFICIENCY
   ================================================================ */

function runTokenEfficiency() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" BENCHMARK 1: Token Efficiency");
  console.log("═══════════════════════════════════════════════════════");

  const amtpTokens = estimateTokens(AMTP_PRODUCT_PAGE);
  const htmlTokens = estimateTokens(HTML_PRODUCT_PAGE);

  console.log(`  AMTP Markdown  : ${AMTP_PRODUCT_PAGE.length} bytes → ~${amtpTokens} tokens`);
  console.log(`  Raw HTML       : ${HTML_PRODUCT_PAGE.length} bytes → ~${htmlTokens} tokens`);
  console.log(`  Reduction      : ${(((htmlTokens - amtpTokens) / htmlTokens) * 100).toFixed(1)}% fewer tokens`);
  console.log(`  Byte reduction : ${(((HTML_PRODUCT_PAGE.length - AMTP_PRODUCT_PAGE.length) / HTML_PRODUCT_PAGE.length) * 100).toFixed(1)}%`);
}

/* ================================================================
   BENCHMARK 2 — PARSER THROUGHPUT
   ================================================================ */

function runParserThroughput() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" BENCHMARK 2: Parser Throughput (ops/sec)");
  console.log("═══════════════════════════════════════════════════════");

  const parser = new AMTPMarkdownParser();
  const ITERATIONS = 10_000;

  // Warm-up
  for (let i = 0; i < 500; i++) {
    parser.parse(AMTP_PRODUCT_PAGE, "/products/mbp-14");
  }

  const t0 = performance.now();
  let count = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    parser.parse(AMTP_PRODUCT_PAGE, "/products/mbp-14");
    count++;
  }
  const elapsed = performance.now() - t0;
  const opsPerSec = Math.round((count / elapsed) * 1000);

  console.log(`  Parser          : ${opsPerSec.toLocaleString()} ops/sec`);
  console.log(`  Avg parse time : ${(elapsed / count).toFixed(3)} ms/op`);

  return opsPerSec;
}

/* ================================================================
   BENCHMARK 3 — LARGE DOCUMENT SCALING
   ================================================================ */

function runLargeDocScaling() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" BENCHMARK 3: Large Document Scaling");
  console.log("═══════════════════════════════════════════════════════");

  const parser = new AMTPMarkdownParser();
  const sizes = [10, 100, 1_000, 10_000, 100_000];

  for (const numSections of sizes) {
    const headers = Array.from({ length: numSections }, (_, i) => `### Section ${i + 1}`);
    const md = `# Large Product\n\n${headers.join("\n")}\n`;
    const ITER = 50;

    const t0 = performance.now();
    for (let i = 0; i < ITER; i++) {
      parser.parse(md, `/large/${i}`);
    }
    const elapsed = performance.now() - t0;
    const opsPerSec = Math.round((ITER / elapsed) * 1000);
    console.log(`  ${numSections.toString().padStart(7)} sections : ${opsPerSec.toLocaleString()} ops/sec`);
  }
}

/* ================================================================
   BENCHMARK 4 — MEMORY (V8 heap snapshot)
   ================================================================ */

function runMemorySnapshot() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" BENCHMARK 4: Memory (20,000 parse ops)");
  console.log("═══════════════════════════════════════════════════════");

  const parser = new AMTPMarkdownParser();
  if (typeof process !== "undefined" && (globalThis as any).gc) {
    (globalThis as any).gc();
  }
  const baseHeap = process.memoryUsage().heapUsed;

  for (let i = 0; i < 20_000; i++) {
    parser.parse(AMTP_PRODUCT_PAGE, `/bench/${i}`);
  }

  if (typeof process !== "undefined" && (globalThis as any).gc) {
    (globalThis as any).gc();
  }
  const afterHeap = process.memoryUsage().heapUsed;
  const diffMB = ((afterHeap - baseHeap) / 1024 / 1024).toFixed(2);
  console.log(`  Heap growth     : ${diffMB} MB (after 20,000 operations)`);
}

/* ================================================================
   MAIN
   ================================================================ */

(async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║           AMTP Protocol — Performance Benchmarks        ║");
  console.log("╚═══════════════════════════════════════════════════════╝");

  runTokenEfficiency();
  runParserThroughput();
  runLargeDocScaling();
  runMemorySnapshot();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  All benchmarks completed");
  console.log("═══════════════════════════════════════════════════════\n");
})();
