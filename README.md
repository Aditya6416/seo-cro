# SEO & CRO Toolkit v2

AI-powered SEO audits and CRO analysis — Gemini Free Tier + live website scraping + SQLite audit history.

## Stack

| Layer | Tech | Cost |
|---|---|---|
| Frontend | Vite (vanilla JS) | Free |
| Backend | Express + Node.js | Free (Render) |
| AI | Gemini 1.5 Flash | Free tier |
| Scraping | Axios + Cheerio | Free |
| Database | SQLite (better-sqlite3) | Free |
| Deploy | Render (backend) + GitHub Pages (frontend) | Free |

---

## Local Development

### 1. Get a free Gemini API key
Go to https://aistudio.google.com/apikey — sign in with Google, click "Create API key". It's free.

### 2. Set up backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and paste your key: GEMINI_API_KEY=your_key_here
npm run dev
```
Backend runs on http://localhost:3001

### 3. Set up frontend (new terminal)
```bash
cd frontend
npm install
npm run start
```
Frontend runs on http://localhost:3000

---

## Deploy to Production

### Step 1 — Deploy backend to Render (free)

1. Push this whole project to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Set these in Render dashboard:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variable**: `GEMINI_API_KEY` = your key
5. Add a **Disk** (for SQLite persistence):
   - Mount path: `/data`
   - Size: 1 GB (free tier allows this)
6. Also update `server.js` line for DB path to use the disk:
   ```js
   const DB_PATH = path.join(process.env.DATA_DIR || __dirname, "cache.db");
   ```
   And add `DATA_DIR=/data` to Render env vars.
7. Click **Deploy**. Render gives you a URL like `https://seo-cro-backend.onrender.com`

### Step 2 — Deploy frontend to GitHub Pages

1. In `frontend/`, create a `.env` file:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```
2. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
3. Push the `dist/` folder to your repo's `gh-pages` branch:
   ```bash
   npm install -g gh-pages
   gh-pages -d dist
   ```
4. In your GitHub repo → Settings → Pages → set source to `gh-pages` branch

Your app is now live at `https://yourusername.github.io/your-repo/`

### Alternative: Deploy frontend to Render too
Add a second Render Static Site service pointing to the `frontend/` folder with:
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Environment Variable**: `VITE_API_URL` = your backend URL

---

## Project Structure

```
seo-cro-deploy/
├── backend/
│   ├── server.js          # Express + Gemini + Cheerio scraper + SQLite
│   ├── package.json       # All backend deps
│   ├── .env               # GEMINI_API_KEY (never commit this)
│   ├── .env.example       # Template
│   ├── render.yaml        # Render deploy config
│   └── cache.db           # Auto-created SQLite DB (gitignored)
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── main.js        # App logic + SSE streaming + history
│       ├── style.css      # Dark theme
│       ├── workflows.js   # Workflow configs + prompt builders
│       └── config.js      # API URL (dev vs prod)
└── README.md
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/run` | Run a workflow (SSE streaming) |
| GET | `/api/history` | Last 10 audits |
| GET | `/api/scrape?url=...` | Raw scrape data for any URL |
| GET | `/api/health` | Health check |

## Gemini Free Tier Limits

Gemini 1.5 Flash free tier (as of 2025):
- 15 requests per minute
- 1 million tokens per minute  
- 1,500 requests per day

More than enough for personal or small team use.
