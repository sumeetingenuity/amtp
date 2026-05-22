#!/usr/bin/env node
/**
 * AMTP CLI — amtp
 *
 * Commands:
 *   amtp init        Scaffold a new AMTP project in a directory
 *   amtp serve       Start an AMTP development server
 *   amtp crawl       Crawl a URL, print the crawl index as JSON
 *   amtp validate    Check one or more markdown files for AMTP validity
 *   amtp doctor      Run all local health checks (type-check, build, test, audit)
 *
 * Requires:
 *   npm install --save-dev commander chalk
 *
 * Usage:
 *   node bin/amtp.ts init my-app
 *   node bin/amtp.ts serve -p 3000
 *   node bin/amtp.ts crawl https://example.com --max-pages 20
 *   node bin/amtp.ts validate README.md docs/ARCHITECTURE.md
 *   node bin/amtp.ts doctor
 */

import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, extname } from "path";

import { AMTPMarkdownParser } from "../src/server/markdown-parser";
import { AMTPResponseBuilder } from "../src/server/amtp-server";
import { SessionManager } from "../src/server/amtp-server";
import { SecurityError } from "../src/server/security";

/* ================================================================
   HELPERS
   ================================================================ */

function logOk(msg: string) { console.log(chalk.green(`✅  ${msg}`)); }
function logWarn(msg: string) { console.log(chalk.yellow(`⚠️   ${msg}`)); }
function logErr(msg: string) { console.log(chalk.red(`❌  ${msg}`)); }
function logInfo(msg: string) { console.log(chalk.cyan(`ℹ️   ${msg}`)); }

/** Exit with a friendly error message */
function fatal(msg: string, code = 1): never {
  logErr(msg);
  process.exit(code);
}

/** Check that a file extension is Markdown (.md or .mdx) */
function isMarkdownFile(path: string): boolean {
  const exts = [".md", ".mdx"];
  return exts.includes(extname(path).toLowerCase());
}

/** Recursively collect .md files from provided paths */
function collectMarkdownFiles(paths: string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) { logWarn(`File not found: ${p}`); continue; }
    const st = require("fs").statSync(p);
    if (st.isDirectory()) {
      for (const entry of require("fs").readdirSync(p, { withFileTypes: true })) {
        if (entry.isFile()) files.push(join(p, entry.name));
      }
    } else if (isMarkdownFile(p)) {
      files.push(p);
    } else {
      logWarn(`Skipping non-markdown file: ${p}`);
    }
  }
  return files;
}

/** Validate a single markdown file against AMTP grammar rules */
function validateMarkdownFile(path: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const raw = readFileSync(path, "utf-8");
  const parser = new AMTPMarkdownParser();

  try {
    const doc = parser.parse(raw, path);

    if (!doc.title || doc.title === "Untitled") {
      errors.push(`${path}: missing or empty H1 title`);
    }

    // Check action IDs are uppercase snake_case
    for (const a of doc.actions) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(a.label || a.id)) {
        errors.push(`${path}: action "${a.label}" should be UPPER_SNAKE_CASE`);
      }
    }

    // Check for forms: ACTION / METHOD / ENDPOINT must each be present
    for (const f of doc.forms) {
      if (!f.action) errors.push(`${path}: form "${f.id}" missing ACTION`);
      if (!f.method) errors.push(`${path}: form "${f.id}" missing METHOD`);
      if (!f.endpoint) errors.push(`${path}: form "${f.id}" missing ENDDPOINT`);
    }

    return { valid: errors.length === 0, errors };
  } catch (e: any) {
    return { valid: false, errors: [`${path}: parse error — ${e.message}`] };
  }
}

/* ================================================================
   COMMAND: init
   ================================================================ */

function cmdInit(dir: string, options: { yes?: boolean }) {
  const target = join(process.cwd(), dir);

  if (existsSync(target)) {
    fatal(`Directory already exists: ${target}`);
  }

  logInfo(`Scaffolding AMTP project in ${target}`);

  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, "src"), { recursive: true });

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: `amtp-app`,
        version: "0.1.0",
        description: "AMTP application",
        main: "src/server/index.ts",
        scripts: {
          dev:   "ts-node src/server/index.ts",
          build: "tsc",
          test:  "jest",
        },
        dependencies: {
          express: "^4.18.2",
          compression: "^1.7.4",
          cors: "^2.8.5",
        },
        devDependencies: {
          typescript: "^5.0.0",
          tsnode: "^10.9.1",
          jest: "^29.5.0",
          "ts-jest": "^29.1.0",
          "@types/express": "^4.17.17",
          "@types/node": "^20.0.0",
        },
      },
      null,
      2
    ),
    "tsconfig.json": JSON.stringify(
      {
        target: "ES2020",
        module: "commonjs",
        rootDir: ".",
        outDir: "dist",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      null,
      2
    ),
    "README.md": `# AMTP App\n\nDescribe your application here.\n`,
    "src/server/index.ts": `import express from "express";\nimport { AMTPServer } from "amtp";\n\nconst app = express();\n\nconst server = new AMTPServer({ port: 3000 });\nawait server.start();\nconsole.log("AMTP server running on :3000");\n`,
    ".gitignore": `\nnode_modules\ndist\n.env\n*.log\n`,
    ".env.example": `# AMTP Server Environment\nAMTP_PORT=3000\nAMTP_ENABLE_CORS=true\nAMTP_ENABLE_RATE_LIMIT=true\n`,
  };

  for (const [path, content] of Object.entries(files)) {
    const full = join(target, path);
    mkdirSync(require("path").dirname(full), { recursive: true });
    writeFileSync(full, content);
    logOk(`Written: ${path}`);
  }

  logOk(`Project created at ${target}`);
  logInfo("Next: cd into the directory and run npm install");
}

/* ================================================================
   COMMAND: serve
   ================================================================ */

function cmdServe(port: number, host: string) {
  logInfo(`Starting AMTP dev server on http://${host}:${port}`);
  // Dynamically require so the compiled output can hot-reload during dev
  const { AMTPServer } = require("../src/server/amtp-server") as any;
  const { AMTPRequestParser } = require("../src/server/amtp-server") as any;
  const { AMTPResponseBuilder } = require("../src/server/amtp-server") as any;

  const server = new AMTPServer({ port, host, enableCORS: true, enableRateLimit: true });
  (server as any).register("get", "/", (_req: any, res: any) => {
    const doc = new AMTPResponseBuilder().build("# AMTP Server\n\nRunning OK");
    const { headers, body } = doc as any;
    for (const [k, v] of Object.entries(headers)) { if (v) res.setHeader(k, v); }
    res.send(body);
  });
  (server as any).start().catch((e: Error) => fatal(e.message));
}

/* ================================================================
   COMMAND: crawl
   ================================================================ */

function cmdCrawl(baseUrl: string, opts: { maxPages?: number; maxDepth?: number; print?: boolean }) {
  const { AMTPCrawler } = require("../src/crawler/amtp-crawler") as any;

  const crawler = new AMTPCrawler({
    baseUrl,
    maxPages: opts.maxPages ?? 50,
    maxDepth: opts.maxDepth ?? 3,
    respectRobotsTxt: false,
    delays: { betweenRequests: 100, betweenDomains: 500 },
  });

  logInfo(`Crawling ${baseUrl} (max ${opts.maxPages ?? 50} pages)…`);
  crawler.crawl().then((pages: any[]) => {
    const indexJson = (crawler as any).exportIndex?.() ?? JSON.stringify({ pages }, null, 2);
    if (opts.print) { console.log(indexJson); } else { console.log(indexJson); }
    logOk(`Crawl complete — ${pages.length} pages`);
  }).catch((e: Error) => fatal(e.message));
}

/* ================================================================
   COMMAND: validate
   ================================================================ */

function cmdValidate(paths: string[], _options: { json?: boolean }) {
  const files = collectMarkdownFiles(paths);
  if (files.length === 0) fatal("No markdown files found to validate.");

  logInfo(`Validating ${files.length} file(s)…`);
  let pass = 0, fail = 0;
  for (const file of files) {
    const { valid, errors } = validateMarkdownFile(file);
    if (valid) {
      logOk(file);
      pass++;
    } else {
      for (const e of errors) logErr(e);
      fail++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

/* ================================================================
   COMMAND: doctor
   ================================================================ */

/**
 * Run a series of health checks and print a report.
 */
async function cmdDoctor(_opts: { fix?: boolean }) {
  const { execSync } = require("child_process");
  let passCount = 0, warnCount = 0, failCount = 0;
  const results: { name: string; status: string; detail?: string }[] = [];

  function check(name: string, fn: () => { ok: boolean; detail?: string }) {
    try {
      const r = fn();
      if (r.ok) { passCount++; results.push({ name, status: "PASS", detail: r.detail }); }
      else { failCount++; results.push({ name, status: "FAIL", detail: r.detail }); }
    } catch (e: any) {
      warnCount++;
      results.push({ name, status: "WARN", detail: e.message });
    }
  }

  check("Type-check", () => {
    try { execSync("npm run type-check", { stdio: "pipe", cwd: process.cwd() }); return { ok: true }; }
    catch { return { ok: false, detail: "tsc reported type errors" }; }
  });

  check("Build", () => {
    try { execSync("npm run build", { stdio: "pipe", cwd: process.cwd() }); return { ok: true }; }
    catch { return { ok: false, detail: "tsc build failed" }; }
  });

  check("Lint", () => {
    try { execSync("npm run lint >/dev/null 2>&1", { stdio: "pipe", cwd: process.cwd() }); return { ok: true }; }
    catch { return { ok: false, detail: "eslint reported warnings" }; }
  });

  check("Tests", () => {
    try {
      const out = execSync("npm test 2>&1", { stdio: "pipe", cwd: process.cwd() });
      const m = out.toString();
      return { ok: m.includes("PASS"), detail: m.split("\n").pop()?.trim() };
    } catch { return { ok: false, detail: "jest reported failures" }; }
  });

  check("npm audit (>= high)", () => {
    try {
      const out = execSync("npm audit --audit-level=moderate 2>&1", { stdio: "pipe", cwd: process.cwd() });
      return { ok: true, detail: "No high/critical vulns" };
    } catch { return { ok: false, detail: "npm audit found issues" }; }
  });

  check("Node version", () => {
    const v = parseInt(process.versions.node.split(".")[0]);
    return { ok: v >= 18, detail: `Node ${process.versions.node}`, };
  });

  check("env file", () => {
    return { ok: !existsSync(join(process.cwd(), ".env")), detail: existsSync(join(process.cwd(), ".env")) ? ".env exists — verify secrets are .gitignore'd" : "OK" };
  });

  check("gitignore", () => {
    return { ok: existsSync(join(process.cwd(), ".gitignore")), detail: ".gitignore present" };
  });

  check("AMTP server types", () => {
    try { require("../src/server/amtp-server"); return { ok: true }; }
    catch (e: any) { return { ok: false, detail: e.message }; }
  });

  // ─── report ───────────────────────────────────────────────────────────
  console.log("\n┌──────────────────────────────────────┐");
  console.log("│         amtp doctor                    │");
  console.log("├──────────────┬─────────────────────────┤");
  for (const r of results) {
    const symbol = r.status === "PASS" ? "✓" : r.status === "WARN" ? "△" : "✗";
    const color = r.status === "PASS" ? chalk.green : r.status === "WARN" ? chalk.yellow : chalk.red;
    console.log(`│  ${color(symbol)} ${r.name.slice(0, 12).padEnd(12)}│${color(r.status).padEnd(26)}│`);
    if (r.detail) console.log(`│              │${chalk.gray(r.detail).padEnd(26)}│`);
  }
  console.log("└──────────────┴─────────────────────────┘");
  const total = passCount + warnCount + failCount;
  console.log(`\n  ${chalk.green(passCount + "/" + total + " passed")}  ${warnCount > 0 ? chalk.yellow(warnCount + " warnings") : ""}  ${failCount > 0 ? chalk.red(failCount + " failed") : ""}`);

  process.exit(failCount > 0 ? 1 : 0);
}

/* ================================================================
   CLI
   ================================================================ */

const program = new Command();

program
  .name("amtp")
  .description("AMTP: Agent Markdown Transfer Protocol — CLI toolkit")
  .version("1.0.0");

program
  .command("init")
  .description("Scaffold a new AMTP project in a directory")
  .argument("<dir>", "Directory to create")
  .option("--yes", "Non-interactive, skip all prompts", false)
  .action((dir: string, opts: any) => cmdInit(dir, opts));

program
  .command("serve")
  .description("Start a local AMTP development server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-h, --host <host>", "Host to bind on", "0.0.0.0")
  .action((opts: any) => void cmdServe(parseInt(opts.port), opts.host));

program
  .command("crawl")
  .description("Crawl an AMTP-enabled site and dump the crawl index as JSON")
  .argument("<url>", "Base URL of the AMTP site to crawl")
  .option("--max-pages <n>", "Max pages to crawl", "50")
  .option("--max-depth <n>", "Max crawl depth", "3")
  .option("--print", "Print the index JSON to stdout", true)
  .action((url: string, opts: any) => {
    void cmdCrawl(url, { maxPages: parseInt(opts.maxPages), maxDepth: parseInt(opts.maxDepth), print: opts.print });
  });

program
  .command("validate")
  .description("Check markdown files for AMTP structural validity")
  .argument("<files...>", "Markdown file(s) or directory to validate")
  .option("--json", "Output results as JSON", false)
  .action((files: string[], opts: any) => cmdValidate(files, opts));

program
  .command("doctor")
  .description("Run all local health checks and report results")
  .option("--fix", "Attempt automatic fixes where supported", false)
  .action((opts: any) => void cmdDoctor(opts));

program.parse();
