const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Gemini client ──────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

// ── SIMPLE MEMORY STORAGE (REPLACES SQLITE) ────────────────────
const cacheStore = new Map();
const auditStore = [];

// ── CACHE HELPERS ──────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 6;

function getCache(key) {
  const row = cacheStore.get(key);
  if (!row) return null;

  const age = Date.now() / 1000 - row.created_at;
  if (age > CACHE_TTL) {
    cacheStore.delete(key);
    return null;
  }
  return row.value;
}

function setCache(key, value) {
  cacheStore.set(key, {
    value,
    created_at: Math.floor(Date.now() / 1000),
  });
}

// ── SCRAPER ────────────────────────────────────────────────────
async function scrapeUrl(url) {
  const cacheKey = `scrape:${url}`;
  const cached = getCache(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const { data, headers } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)",
      },
    });

    const $ = cheerio.load(data);

    const scraped = {
      title: $("title").text().trim(),
      metaDescription: $('meta[name="description"]').attr("content") || "",
      h1: $("h1").map((_, el) => $(el).text().trim()).get(),
      h2: $("h2").map((_, el) => $(el).text().trim()).get().slice(0, 10),
      h3: $("h3").map((_, el) => $(el).text().trim()).get().slice(0, 10),
      wordCount: $("body").text().replace(/\s+/g, " ").trim().split(" ").length,
      hasSchema: data.includes("application/ld+json"),
      contentType: headers["content-type"] || "",
    };

    setCache(cacheKey, JSON.stringify(scraped));
    return scraped;
  } catch (err) {
    return { error: `Could not scrape ${url}: ${err.message}` };
  }
}

// ── PROMPTS ────────────────────────────────────────────────────
function getSystemPrompt(workflow) {
  const prompts = {
    "seo-audit": `You are a senior SEO consultant. Use real scraped data only.`,
    keyword: `You are an SEO keyword researcher.`,
    content: `You are a content strategist.`,
    cro: `You are a CRO expert using real data.`,
    competitor: `You are a competitive SEO analyst.`,
  };

  return prompts[workflow] || `You are an SEO expert.`;
}

// ── STREAM AI ──────────────────────────────────────────────────
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
      if (i < MODELS.length - 1) continue;
      throw err;
    }
  }
}

// ── API: RUN ───────────────────────────────────────────────────
app.post("/api/run", async (req, res) => {
  const { prompt, workflow, url } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let enrichedPrompt = prompt;

    if (url && ["seo-audit", "cro"].includes(workflow)) {
      res.write(`data: ${JSON.stringify({ text: "🔍 Scraping website...\n\n" })}\n\n`);

      const scraped = await scrapeUrl(url);

      if (!scraped.error) {
        enrichedPrompt = `
${prompt}

--- LIVE SCRAPED DATA ---
${JSON.stringify(scraped, null, 2)}
--- END DATA ---
        `;
      }
    }

    const systemPrompt = getSystemPrompt(workflow);
    const fullPrompt = `${systemPrompt}\n\n${enrichedPrompt}`;

    const fullText = await streamWithFallback(fullPrompt, res);

    auditStore.push({
      workflow: workflow || "general",
      url: url || "",
      result: fullText?.slice(0, 5000) || "",
      created_at: Date.now(),
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ text: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

// ── HISTORY ────────────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  res.json(auditStore.slice(-10).reverse());
});

// ── SCRAPE ─────────────────────────────────────────────────────
app.get("/api/scrape", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  const data = await scrapeUrl(url);
  res.json(data);
});

// ── HEALTH ─────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    models: MODELS,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`Models: ${MODELS.join(", ")}`);
});