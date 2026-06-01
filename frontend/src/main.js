import { workflows } from "./workflows.js";
import { API_BASE } from "./config.js";

let activeWorkflow = workflows[0];

// ── Router ─────────────────────────────────────────────────────
function getPage() {
  return location.hash.startsWith("#results") ? "results" : "dashboard";
}

function navigate(page, params = {}) {
  if (page === "results") {
    const q = new URLSearchParams(params).toString();
    location.hash = "results?" + q;
  } else {
    location.hash = "";
  }
}

window.addEventListener("hashchange", () => {
  if (getPage() === "results") renderResults();
  else renderDashboard();
});

// ── Dashboard page ─────────────────────────────────────────────
// ── Dashboard page ─────────────────────────────────────────────
function renderDashboard() {
  document.getElementById("app").innerHTML = `
    <div class="header">
      <div class="logo">
        <img src="/logo.png" alt="InsiteArc" class="logo-image">
        <div class="logo-content">
          <h1>InsiteArc</h1>
          <p>AI-powered SEO & CRO Intelligence Platform</p>
        </div>
      </div>
    </div>

    <div class="dashboard-layout">
      <div class="card-grid" id="card-grid"></div>
      <div class="detail-panel" id="detail-panel"></div>
    </div>
  `;

  renderCards();
  renderDetail();
}

function renderCards() {
  const grid = document.getElementById("card-grid");
  const main = workflows.filter(w => !w.single);
  const single = workflows.filter(w => w.single);
  grid.innerHTML = main.map(cardHTML).join("") + single.map(w => cardHTML(w, true)).join("");
}

function cardHTML(w, isSingle = false) {
  return `<div class="workflow-card${isSingle ? " card-single" : ""}${w.id === activeWorkflow.id ? " active" : ""}" onclick="selectWorkflow('${w.id}')">
    <span class="badge ${w.badgeClass}">${w.badge}</span>
    <i class="ti ${w.icon} card-icon"></i>
    <div class="card-title">${w.title}</div>
    <div class="card-desc">${w.desc}</div>
  </div>`;
}

function renderDetail() {
  const w = activeWorkflow;
  document.getElementById("detail-panel").innerHTML = `
    <div class="detail-label">${w.label}</div>
    <div class="detail-header"><i class="ti ${w.icon}"></i><span>${w.title}</span></div>
    <div class="detail-desc">${w.detailDesc}</div>
    ${w.fields.map(f => `
      <div class="field-group">
        <label class="field-label">${f.label}</label>
        ${f.type === "textarea"
          ? `<textarea id="field-${f.id}" placeholder="${f.placeholder}"></textarea>`
          : `<input type="text" id="field-${f.id}" placeholder="${f.placeholder}" />`}
      </div>`).join("")}
    <button class="run-btn" id="run-btn" onclick="runWorkflow()">
      <i class="ti ti-rocket"></i> Run ${w.title} ↗
    </button>
  `;
}

window.selectWorkflow = function(id) {
  activeWorkflow = workflows.find(w => w.id === id);
  renderCards();
  renderDetail();
};

window.runWorkflow = function() {
  const vals = {};
  activeWorkflow.fields.forEach(f => {
    const el = document.getElementById(`field-${f.id}`);
    if (el) vals[f.id] = el.value.trim();
  });
  const urlField = activeWorkflow.fields.find(f => f.isUrl);
  const url = urlField ? vals[urlField.id] : "";
  const prompt = activeWorkflow.buildPrompt(vals);

  // store state for results page
  sessionStorage.setItem("seo_pending", JSON.stringify({
    workflow: activeWorkflow.id,
    workflowTitle: activeWorkflow.title,
    workflowIcon: activeWorkflow.icon,
    prompt,
    url,
  }));

  navigate("results");
};

// ── Results page ───────────────────────────────────────────────
function renderResults() {
  const pending = JSON.parse(sessionStorage.getItem("seo_pending") || "{}");

  document.getElementById("app").innerHTML = `
    <div class="results-topbar">
      <button class="back-btn" onclick="goBack()">
        <i class="ti ti-arrow-left"></i> Back to dashboard
      </button>
      <div class="results-title-row">
        <i class="ti ${pending.workflowIcon || "ti-sparkles"}" style="font-size:18px;color:#888;"></i>
        <span id="results-title">${pending.workflowTitle || "Audit"} results</span>
        <div class="status-dot idle" id="status-dot"></div>
        <span class="status-text" id="status-text">Starting...</span>
      </div>
      <div class="results-actions">
        <button class="action-btn" id="history-btn" onclick="loadHistory()">
          <i class="ti ti-history"></i> History
        </button>
        <button class="action-btn" id="copy-btn" onclick="copyOutput()">
          <i class="ti ti-copy"></i> Copy
        </button>
        <button class="action-btn" onclick="downloadOutput()">
          <i class="ti ti-download"></i> Download
        </button>
      </div>
    </div>
    <div class="results-body" id="output-body">
      <div class="results-loading">
        <i class="ti ti-loader-2" style="font-size:28px;color:#555;animation:spin 1s linear infinite;"></i>
        <p>${pending.url ? "Scraping " + pending.url + "..." : "Analysing..."}</p>
      </div>
    </div>
  `;

  if (pending.prompt) {
    streamResults(pending);
  }
}

window.goBack = function() {
  navigate("dashboard");
};

async function streamResults(pending) {
  const outputBody = document.getElementById("output-body");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  statusDot.className = "status-dot running";
  statusText.textContent = "Running...";
  outputBody.innerHTML = "";

  let fullText = "";

  try {
    const res = await fetch(`${API_BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: pending.prompt,
        workflow: pending.workflow,
        url: pending.url,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Request failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.text) {
            fullText += data.text;
            outputBody.innerHTML = renderMarkdown(fullText);
            outputBody.scrollTop = outputBody.scrollHeight;
          }
          if (data.done) {
            statusDot.className = "status-dot done";
            statusText.textContent = "Complete";
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    outputBody.innerHTML = `<div class="error-block">
      <strong>Error:</strong> ${err.message}<br><br>
      <small>Check that GEMINI_API_KEY is set and backend is running.</small>
    </div>`;
    statusDot.className = "status-dot idle";
    statusText.textContent = "Failed";
  }
}

window.copyOutput = function() {
  const text = document.getElementById("output-body")?.innerText;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copy-btn");
    btn.innerHTML = `<i class="ti ti-check"></i> Copied`;
    setTimeout(() => { btn.innerHTML = `<i class="ti ti-copy"></i> Copy`; }, 2000);
  });
};

window.downloadOutput = function() {
  const text = document.getElementById("output-body")?.innerText;
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "seo-audit-results.txt";
  a.click();
};

window.loadHistory = async function() {
  const outputBody = document.getElementById("output-body");
  try {
    const res = await fetch(`${API_BASE}/api/history`);
    const rows = await res.json();
    if (!rows.length) {
      outputBody.innerHTML = `<p class="muted-msg">No audit history yet.</p>`;
      return;
    }
    outputBody.innerHTML = `<h2 class="section-heading">Recent audits</h2>` +
      rows.map(r => `<div class="history-row">
        <div>
          <span class="history-badge">${r.workflow}</span>
          <span class="history-url">${r.url || "—"}</span>
        </div>
        <span class="history-date">${new Date(r.created_at * 1000).toLocaleDateString()}</span>
      </div>`).join("");
  } catch (_) {
    outputBody.innerHTML = `<p class="error-msg">Could not load history.</p>`;
  }
};

// ── Markdown renderer ──────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>")
    .replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/\*\*CRITICAL\*\*/g,'<span class="severity-critical">CRITICAL</span>')
    .replace(/\*\*WARNING\*\*/g,'<span class="severity-warning">WARNING</span>')
    .replace(/\*\*OPPORTUNITY\*\*/g,'<span class="severity-opportunity">OPPORTUNITY</span>')
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/^---$/gm,"<hr>")
    .replace(/^[*-] (.+)$/gm,"<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm,"<li>$2</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g,"</p><p>")
    .replace(/^(?!<[hul\/]|<hr)(.+)$/gm, m => m.startsWith("<") ? m : `<p>${m}</p>`);
}

const style = document.createElement("style");
style.textContent = `@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`;
document.head.appendChild(style);

// ── Boot ───────────────────────────────────────────────────────
if (getPage() === "results") renderResults();
else renderDashboard();
