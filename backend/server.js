const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const cheerio = require("cheerio");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Gemini client ──────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model priority: tries each in order, falls back if quota hit
const MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

async function getWorkingModel() {
  return genAI.getGenerativeModel({ model: MODELS[0] });
}

// ── SQLite cache ───────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "cache.db");
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow TEXT,
    url TEXT,
    result TEXT,
    created_at INTEGER NOT NULL
  )
`);

const CACHE_TTL = 60 * 60 * 6;

function getCache(key) {
  const row = db.prepare("SELECT * FROM cache WHERE key = ?").get(key);
  if (!row) return null;
  const age = Date.now() / 1000 - row.created_at;
  if (age > CACHE_TTL) {
    db.prepare("DELETE FROM cache WHERE key = ?").run(key);
    return null;
  }
  return row.value;
}

function setCache(key, value) {
  db.prepare("INSERT OR REPLACE INTO cache (key, value, created_at) VALUES (?, ?, ?)").run(
    key, value, Math.floor(Date.now() / 1000)
  );
}

// ── Web scraper ────────────────────────────────────────────────
async function scrapeUrl(url) {
  const cacheKey = `scrape:${url}`;
  const cached = getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const { data, headers } = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
    });

    const $ = cheerio.load(data);
    const scraped = {
      title: $("title").text().trim(),
      metaDescription: $('meta[name="description"]').attr("content") || "",
      h1: $("h1").map((_, el) => $(el).text().trim()).get(),
      h2: $("h2").map((_, el) => $(el).text().trim()).get().slice(0, 10),
      h3: $("h3").map((_, el) => $(el).text().trim()).get().slice(0, 10),
      links: { internal: [], external: [] },
      images: {
        total: $("img").length,
        missingAlt: $("img:not([alt])").length,
        emptyAlt: $("img[alt='']").length,
      },
      canonical: $('link[rel="canonical"]').attr("href") || "",
      robots: $('meta[name="robots"]').attr("content") || "",
      ogTitle: $('meta[property="og:title"]').attr("content") || "",
      ogDesc: $('meta[property="og:description"]').attr("content") || "",
      wordCount: $("body").text().replace(/\s+/g, " ").trim().split(" ").length,
      hasSchema: data.includes("application/ld+json"),
      hasSitemap: false,
      contentType: headers["content-type"] || "",
    };

    const domain = new URL(url).hostname;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      try {
        const abs = new URL(href, url);
        if (abs.hostname === domain) scraped.links.internal.push(abs.href);
        else scraped.links.external.push(abs.href);
      } catch (_) {}
    });
    scraped.links.internal = [...new Set(scraped.links.internal)].slice(0, 30);
    scraped.links.external = [...new Set(scraped.links.external)].slice(0, 20);

    try {
      await axios.get(`${new URL(url).origin}/sitemap.xml`, { timeout: 5000 });
      scraped.hasSitemap = true;
    } catch (_) {}

    setCache(cacheKey, JSON.stringify(scraped));
    return scraped;
  } catch (err) {
    return { error: `Could not scrape ${url}: ${err.message}` };
  }
}

// ── System prompts ─────────────────────────────────────────────
function getSystemPrompt(workflow) {
  const prompts = {
    "seo-audit": `You are a senior SEO consultant with 15+ years of experience.
You will receive LIVE scraped data from a website. Use these real numbers in your analysis — do not make up data.
Structure your response with: Technical Issues, Content Gaps, Keyword Opportunities, and Priority Action Items.
Label every finding: CRITICAL / WARNING / OPPORTUNITY. Be specific with numbers from the scraped data.`,
    keyword: `You are an expert keyword researcher and SEO strategist.
Find low-competition, high-intent keywords with strong ranking potential.
Group by intent: Informational, Commercial, Transactional.
For each cluster include: estimated difficulty (1-100), content format recommendation, monthly search volume range.`,
    content: `You are a content strategist and SEO expert.
Create detailed 30-day content plans with specific blog topics, target keywords, and publishing schedules.
For each piece include: title, target keyword, content type, word count target, internal linking suggestions, expected traffic potential.`,
    cro: `You are an expert Conversion Rate Optimization (CRO) consultant.
You will receive LIVE scraped data. Use real numbers in your analysis.
Structure findings: SEVERITY, ISSUE, ROOT CAUSE, FIX, ESTIMATED CVR IMPACT.
Top 5 issues first, then A/B test recommendations.`,
    competitor: `You are a competitive intelligence and SEO analyst.
Analyze competitors to find exploitable gaps.
Structure: Content Gaps, Keyword Opportunities, Backlink Sources, Top Pages Analysis, 5 Priority Opportunities.`,
  };
  return prompts[workflow] || `You are an expert SEO and CRO consultant. Provide detailed, actionable analysis.`;
}

// ── Retry with model fallback ──────────────────────────────────
async function streamWithFallback(prompt, res) {
  for (let i = 0; i < MODELS.length; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: MODELS[i] });
      const result = await model.generateContentStream(prompt);
      let fullText = "";
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
      return fullText;
    } catch (err) {
      const isQuota = err.message?.includes("429") || err.message?.includes("quota");
      if (isQuota && i < MODELS.length - 1) {
        // try next model
        res.write(`data: ${JSON.stringify({ text: `\n⚠️ Switching to fallback model...\n\n` })}\n\n`);
        continue;
      }
      throw err;
    }
  }
}

// ── /api/run ───────────────────────────────────────────────────
app.post("/api/run", async (req, res) => {
  const { prompt, workflow, url } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let enrichedPrompt = prompt;

    if (url && ["seo-audit", "cro"].includes(workflow)) {
      res.write(`data: ${JSON.stringify({ text: "🔍 Scraping website...\n\n" })}\n\n`);
      const scraped = await scrapeUrl(url);
      if (!scraped.error) {
        enrichedPrompt = `${prompt}\n\n--- LIVE SCRAPED DATA ---\n${JSON.stringify(scraped, null, 2)}\n--- END SCRAPED DATA ---\n\nUse the above real data in your analysis.`;
      }
    }

    const systemPrompt = getSystemPrompt(workflow);
    const fullPrompt = `${systemPrompt}\n\n${enrichedPrompt}`;

    const fullText = await streamWithFallback(fullPrompt, res);

    db.prepare("INSERT INTO audits (workflow, url, result, created_at) VALUES (?, ?, ?, ?)").run(
      workflow || "general", url || "", (fullText || "").slice(0, 5000), Math.floor(Date.now() / 1000)
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    const isQuota = err.message?.includes("429") || err.message?.includes("quota");
    const msg = isQuota
      ? "\n\n❌ Free tier quota exceeded. Please wait a minute and try again — Gemini free tier resets every minute/day.\n\nTip: go to https://aistudio.google.com to check your quota status."
      : `\n\nError: ${err.message}`;
    res.write(`data: ${JSON.stringify({ text: msg })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

// ── /api/history ───────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  const rows = db.prepare("SELECT id, workflow, url, created_at FROM audits ORDER BY created_at DESC LIMIT 10").all();
  res.json(rows);
});

// ── /api/scrape ────────────────────────────────────────────────
app.get("/api/scrape", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url query param required" });
  const data = await scrapeUrl(url);
  res.json(data);
});

// ── /api/health ────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", models: MODELS, timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 SEO/CRO Toolkit running on http://localhost:${PORT}`);
  console.log(`   Model: ${MODELS[0]} (with ${MODELS.length - 1} fallbacks)`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "✓ set" : "✗ MISSING"}\n`);
});
