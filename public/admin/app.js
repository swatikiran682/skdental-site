// SK Dental Admin V1 — vanilla JS, no build step.
// Auth: GitHub PAT in localStorage. Editing: GitHub Contents API.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const TOKEN_KEY = "skdental_admin_token";

// ─── TOAST ──────────────────────────────────────────
function toast(msg, type) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + (type || "");
  setTimeout(() => (el.className = "toast hidden"), 3500);
}

// ─── GITHUB API ─────────────────────────────────────
const GH = "https://api.github.com";

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

async function ghRequest(path, opts = {}) {
  const token = getToken();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(opts.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(GH + path, { ...opts, headers });
  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!resp.ok) {
    const msg = (data && data.message) || `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getCurrentUser() {
  return ghRequest("/user");
}

async function getFileContent(path) {
  // Returns { content (base64), sha }
  const data = await ghRequest(
    `/repos/${REPO.owner}/${REPO.name}/contents/${encodeURIComponent(path)}?ref=${REPO.branch}`
  );
  // GitHub returns base64 with newlines; decode UTF-8
  const decoded = decodeBase64Utf8(data.content);
  return { content: decoded, sha: data.sha };
}

async function putFileContent(path, content, sha, message) {
  return ghRequest(
    `/repos/${REPO.owner}/${REPO.name}/contents/${encodeURIComponent(path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        content: encodeBase64Utf8(content),
        sha: sha,
        branch: REPO.branch,
      }),
    }
  );
}

function encodeBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function decodeBase64Utf8(b64) {
  // Strip whitespace inside the base64 payload (GitHub may include \n)
  const clean = b64.replace(/\s/g, "");
  return decodeURIComponent(escape(atob(clean)));
}

// ─── ROUTING ────────────────────────────────────────
function route() {
  const hash = location.hash || "#/dashboard";
  if (hash === "#/dashboard") {
    renderDashboard();
  } else if (hash.startsWith("#/edit/")) {
    const idx = parseInt(hash.slice("#/edit/".length), 10);
    renderEditor(idx);
  } else if (hash === "#/settings") {
    renderSettings();
  } else if (hash === "#/qr") {
    renderQR();
  } else {
    location.hash = "#/dashboard";
  }
}
window.addEventListener("hashchange", route);

// ─── LOGIN ──────────────────────────────────────────
async function tryAutoLogin() {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return showLogin();
  try {
    const me = await getCurrentUser();
    showApp(me);
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }
}

function showLogin() {
  $("#view-app").classList.add("hidden");
  $("#view-login").classList.remove("hidden");
  $("#login-error").classList.add("hidden");
}

function showApp(user) {
  $("#view-login").classList.add("hidden");
  $("#view-app").classList.remove("hidden");
  const chip = $("#user-chip");
  if (chip) chip.textContent = user.login;
  route();
}

async function handleLogin() {
  const pat = $("#pat").value.trim();
  const remember = $("#remember").checked;
  const errEl = $("#login-error");
  errEl.classList.add("hidden");

  if (!pat) {
    errEl.textContent = "Please paste a token first.";
    errEl.classList.remove("hidden");
    return;
  }

  $("#btn-login").disabled = true;
  $("#btn-login").innerHTML = '<span class="spinner"></span>';

  try {
    // Try the token; pick storage based on "remember me"
    if (remember) {
      localStorage.setItem(TOKEN_KEY, pat);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, pat);
      localStorage.removeItem(TOKEN_KEY);
    }
    const me = await getCurrentUser();
    showApp(me);
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    errEl.textContent = humanizeAuthError(e);
    errEl.classList.remove("hidden");
  } finally {
    $("#btn-login").disabled = false;
    $("#btn-login").textContent = "Sign in";
  }
}

function humanizeAuthError(e) {
  if (e.status === 401) return "Token rejected. Double-check it was copied in full and has not expired.";
  if (e.status === 403) return "Token does not have the right permissions. Make sure 'Contents: Read and write' is enabled.";
  if (e.message && e.message.includes("Failed to fetch"))
    return "Network error. Check your internet connection and try again.";
  return e.message || "Sign in failed.";
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
}

// ─── DASHBOARD ──────────────────────────────────────
async function renderDashboard() {
  const main = $("#main");
  main.innerHTML = `
    <section class="dashboard">
      <div class="dashboard-hero">
        <div>
          <h1>Pages you can edit</h1>
          <p class="subtitle">Click a page to open the editor. Saving commits to GitHub and the live site updates within ~60 seconds.</p>
        </div>
        <div class="stats-row" id="stats-row">
          <div class="stat-pill live">
            <span class="dot"></span>
            <span class="stat-label">Site</span>
            <span class="stat-value">Live</span>
          </div>
          <div class="stat-pill">
            <span class="stat-label">Pages</span>
            <span class="stat-value">${EDITABLE_PAGES.length}</span>
          </div>
          <div class="stat-pill" id="last-deploy-pill">
            <span class="stat-label">Last deploy</span>
            <span class="stat-value" id="last-deploy">…</span>
          </div>
        </div>
      </div>

      <div class="section-header">
        <h2>All pages</h2>
      </div>
      <div class="page-grid" id="page-grid"></div>
    </section>
  `;
  const grid = $("#page-grid");
  EDITABLE_PAGES.forEach((p, i) => {
    const card = document.createElement("a");
    card.className = "page-card";
    card.href = `#/edit/${i}`;
    card.innerHTML = `
      <div class="icon">${p.icon || "📄"}</div>
      <h3>${escapeHtml(p.title)}</h3>
      <div class="desc">${escapeHtml(p.description)}</div>
      <span class="path">${escapeHtml(p.path.replace(/^public\//, "/"))}</span>
    `;
    grid.appendChild(card);
  });

  // Fetch last deploy time + visitor stats (if GoatCounter configured)
  fetchLastDeploy();
  fetchVisitorStats();
}

async function fetchLastDeploy() {
  try {
    const runs = await ghRequest(`/repos/${REPO.owner}/${REPO.name}/actions/runs?per_page=1`);
    if (runs && runs.workflow_runs && runs.workflow_runs[0]) {
      const r = runs.workflow_runs[0];
      const time = relativeTime(new Date(r.created_at));
      const el = $("#last-deploy");
      if (el) el.textContent = time;
    }
  } catch (e) {
    const el = $("#last-deploy");
    if (el) el.textContent = "—";
  }
}

async function fetchVisitorStats() {
  // Try to read site-settings.json from the live site to find GoatCounter URL
  let settings = null;
  try {
    const file = await getFileContent(SITE_SETTINGS_FILE);
    settings = JSON.parse(file.content);
  } catch {
    return; // No settings file yet
  }

  const gc = (settings.goatcounter_url || "").replace(/\/$/, "");
  if (!gc) return;

  // Inject extra stat pills via dynamic dom insertion
  const row = document.querySelector(".stats-row");
  if (!row) return;

  const todayPill = document.createElement("a");
  todayPill.href = gc;
  todayPill.target = "_blank";
  todayPill.rel = "noopener";
  todayPill.className = "stat-pill stat-pill-link";
  todayPill.title = "Open GoatCounter dashboard";
  todayPill.innerHTML = `<span class="stat-label">👁 Visits today</span><span class="stat-value" id="visits-today">…</span>`;
  row.appendChild(todayPill);

  const totalPill = document.createElement("a");
  totalPill.href = gc;
  totalPill.target = "_blank";
  totalPill.rel = "noopener";
  totalPill.className = "stat-pill stat-pill-link";
  totalPill.title = "Open GoatCounter dashboard";
  totalPill.innerHTML = `<span class="stat-label">📊 Last 30 days</span><span class="stat-value" id="visits-30d">…</span>`;
  row.appendChild(totalPill);

  // GoatCounter has an open /counter endpoint that returns JSON for any path.
  // For aggregate stats we'd normally need an API token, but we can show a
  // best-effort number from the public counter for the homepage.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    // Use the public TOTAL.json endpoint (aggregate count for whole site)
    const r1 = await fetch(`${gc}/counter/TOTAL.json?start=${today}&end=${today}`);
    const j1 = r1.ok ? await r1.json() : null;
    document.getElementById("visits-today").textContent = j1 ? formatNum(j1.count_unique || j1.count || 0) : "—";

    const r2 = await fetch(`${gc}/counter/TOTAL.json?start=${since30}`);
    const j2 = r2.ok ? await r2.json() : null;
    document.getElementById("visits-30d").textContent = j2 ? formatNum(j2.count_unique || j2.count || 0) : "—";
  } catch (e) {
    // CORS or service down — set to a clickable "View" link
    document.getElementById("visits-today").textContent = "View →";
    document.getElementById("visits-30d").textContent = "View →";
  }
}

function formatNum(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1e6).toFixed(1) + "M";
}

function relativeTime(date) {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ─── EDITOR ─────────────────────────────────────────
let editorState = null; // { path, sha, originalContent }

async function renderEditor(idx) {
  const page = EDITABLE_PAGES[idx];
  if (!page) return (location.hash = "#/dashboard");

  const main = $("#main");
  main.innerHTML = `
    <div class="editor-header">
      <div>
        <div class="breadcrumb">
          <a href="#/dashboard">All pages</a> → ${escapeHtml(page.title)}
        </div>
        <h2>${escapeHtml(page.icon || "📄")} ${escapeHtml(page.title)}</h2>
      </div>
      <div class="actions">
        <button class="btn" id="btn-revert" disabled>Revert</button>
        <button class="btn-primary-sm" id="btn-save" disabled>Save changes</button>
      </div>
    </div>
    <div id="editor-body" class="loading">Loading page from GitHub…</div>
    <div class="editor-meta" id="editor-meta"></div>
  `;

  try {
    const file = await getFileContent(page.path);
    editorState = { path: page.path, sha: file.sha, originalContent: file.content };
    renderEditorBody(page);
  } catch (e) {
    $("#editor-body").innerHTML = `<div class="error">Failed to load: ${escapeHtml(e.message)}</div>`;
  }
}

function renderEditorBody(page) {
  const body = $("#editor-body");
  body.classList.remove("loading");
  body.innerHTML = `
    <div class="editor-grid">
      <div class="editor-panel">
        <div class="panel-header">HTML source — edit here</div>
        <textarea id="html-editor" spellcheck="false"></textarea>
      </div>
      <div class="editor-panel">
        <div class="panel-header">Live preview</div>
        <iframe id="preview-frame" class="preview-frame" sandbox="allow-same-origin"></iframe>
      </div>
    </div>
  `;
  const textarea = $("#html-editor");
  textarea.value = editorState.originalContent;

  // Initial preview
  updatePreview(textarea.value);

  // Track modifications + debounced preview refresh
  let debounceTimer;
  textarea.addEventListener("input", () => {
    const modified = textarea.value !== editorState.originalContent;
    $("#btn-save").disabled = !modified;
    $("#btn-revert").disabled = !modified;
    setMeta(modified ? "Unsaved changes" : "No changes", modified ? "modified" : "");
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => updatePreview(textarea.value), 400);
  });

  $("#btn-save").onclick = () => saveChanges(page);
  $("#btn-revert").onclick = () => {
    if (confirm("Discard your unsaved changes?")) {
      textarea.value = editorState.originalContent;
      $("#btn-save").disabled = true;
      $("#btn-revert").disabled = true;
      updatePreview(textarea.value);
      setMeta("Reverted", "");
    }
  };

  setMeta("Loaded from GitHub", "saved");
}

function updatePreview(html) {
  const iframe = $("#preview-frame");
  if (!iframe) return;
  // Use srcdoc so root-relative URLs in the HTML work against the live origin
  // Inject a <base> tag so /wp-content/, /wp-includes/ etc. resolve correctly
  let injected = html;
  if (!/<base\s/i.test(injected)) {
    injected = injected.replace(/<head([^>]*)>/i, '<head$1>\n<base href="https://skdentalgroup.com/">');
  }
  iframe.srcdoc = injected;
}

function setMeta(text, cls) {
  const el = $("#editor-meta");
  el.innerHTML = `<span class="${cls}">${escapeHtml(text)}</span>`;
}

async function saveChanges(page) {
  const newContent = $("#html-editor").value;
  if (newContent === editorState.originalContent) return;

  const btn = $("#btn-save");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const message = `Edit ${page.title} via admin panel`;
    const result = await putFileContent(page.path, newContent, editorState.sha, message);
    editorState.originalContent = newContent;
    editorState.sha = result.content.sha;
    $("#btn-revert").disabled = true;
    btn.disabled = true;
    btn.textContent = "Save changes";
    setMeta("Saved. Live site will update in ~60 seconds.", "saved");
    toast("Saved! Site rebuilding…", "success");
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Save changes";
    setMeta(`Save failed: ${e.message}`, "modified");
    toast(`Save failed: ${e.message}`, "error");
  }
}

// ─── QR CODE GENERATOR ──────────────────────────────
function renderQR() {
  const main = $("#main");
  main.innerHTML = `
    <section class="qr-page">
      <div class="breadcrumb"><a href="#/dashboard">All pages</a> → QR codes</div>
      <h2 style="margin:4px 0 6px;">QR Code Generator</h2>
      <p class="muted" style="margin-bottom:24px;">Print these on business cards, posters, brochures, or share digitally.</p>

      <div class="qr-grid">
        <div class="qr-form-card">
          <label for="qr-url">URL or text</label>
          <input type="text" id="qr-url" value="https://skdentalgroup.com" placeholder="https://...">

          <div class="qr-presets">
            <span class="muted" style="font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;">Quick presets</span>
            <div class="preset-buttons">
              <button class="preset-btn" data-url="https://skdentalgroup.com">Homepage</button>
              <button class="preset-btn" data-url="https://skdentalgroup.com/contact-us/">Contact</button>
              <button class="preset-btn" data-url="https://skdentalgroup.com/services/general/">Services</button>
              <button class="preset-btn" data-url="https://skdentalgroup.com/first-visit/">First Visit</button>
            </div>
          </div>

          <div class="qr-options">
            <div class="option-row">
              <label for="qr-size">Size</label>
              <select id="qr-size">
                <option value="200">Small (200px)</option>
                <option value="400" selected>Medium (400px)</option>
                <option value="600">Large (600px)</option>
                <option value="1000">XL print (1000px)</option>
              </select>
            </div>
            <div class="option-row">
              <label for="qr-color">Foreground</label>
              <input type="color" id="qr-color" value="#0660b0">
            </div>
            <div class="option-row">
              <label for="qr-bg">Background</label>
              <input type="color" id="qr-bg" value="#ffffff">
            </div>
            <div class="option-row">
              <label for="qr-level">Error correction</label>
              <select id="qr-level">
                <option value="L">L (lowest, smallest)</option>
                <option value="M" selected>M (recommended)</option>
                <option value="Q">Q</option>
                <option value="H">H (highest, biggest)</option>
              </select>
            </div>
          </div>

          <button class="btn-primary-sm" id="qr-download" style="margin-top:18px;width:100%;">Download as PNG</button>
        </div>

        <div class="qr-preview-card">
          <div class="panel-header">Preview</div>
          <div class="qr-canvas-wrap">
            <canvas id="qr-canvas"></canvas>
          </div>
          <div class="qr-info" id="qr-info"></div>
        </div>
      </div>
    </section>
  `;

  const qr = new QRious({
    element: document.getElementById("qr-canvas"),
    size: 400,
    value: "https://skdentalgroup.com",
    foreground: "#0660b0",
    background: "#ffffff",
    level: "M",
  });

  function refresh() {
    qr.set({
      value: $("#qr-url").value || "https://skdentalgroup.com",
      size: parseInt($("#qr-size").value, 10),
      foreground: $("#qr-color").value,
      background: $("#qr-bg").value,
      level: $("#qr-level").value,
    });
    $("#qr-info").innerHTML =
      `<span class="muted">Encodes <code>${escapeHtml(qr.value)}</code> at ${qr.size}×${qr.size}px</span>`;
  }
  refresh();

  $("#qr-url").addEventListener("input", refresh);
  $$(".preset-btn").forEach((b) =>
    b.addEventListener("click", () => {
      $("#qr-url").value = b.dataset.url;
      refresh();
    })
  );
  ["qr-size", "qr-color", "qr-bg", "qr-level"].forEach((id) =>
    $("#" + id).addEventListener("change", refresh)
  );

  $("#qr-download").addEventListener("click", () => {
    const link = document.createElement("a");
    const fname = "qr-" + (qr.value || "code").replace(/[^a-z0-9]+/gi, "-").slice(0, 40) + ".png";
    link.download = fname;
    link.href = $("#qr-canvas").toDataURL("image/png");
    link.click();
    toast(`Downloaded ${fname}`, "success");
  });
}

// ─── SITE SETTINGS ──────────────────────────────────
const SITE_SETTINGS_FILE = "public/site-settings.json";
const DEFAULT_SETTINGS = {
  phone: "",
  email: "",
  address_line1: "",
  address_line2: "",
  hours_weekday: "Mon–Fri: 9:00 AM – 5:00 PM",
  hours_saturday: "Sat: 10:00 AM – 2:00 PM",
  hours_sunday: "Sun: Closed",
  doctor_name: "",
  doctor_bio: "",
  facebook: "",
  instagram: "",
  twitter: "",
  google_maps: "",
  // Optional analytics
  goatcounter_url: "",
};

async function renderSettings() {
  const main = $("#main");
  main.innerHTML = `
    <section class="settings-page">
      <div class="breadcrumb"><a href="#/dashboard">All pages</a> → Settings</div>
      <h2 style="margin:4px 0 6px;">Site Settings</h2>
      <p class="muted" style="margin-bottom:24px;">Edit clinic info that appears across all pages. Saving updates <code>site-settings.json</code>; the public site reads from this on every page load.</p>
      <div class="loading">Loading settings…</div>
    </section>
  `;

  let settings = { ...DEFAULT_SETTINGS };
  let sha = null;
  try {
    const file = await getFileContent(SITE_SETTINGS_FILE);
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(file.content) };
    sha = file.sha;
  } catch (e) {
    if (e.status !== 404) {
      $(".settings-page .loading").innerHTML = `<div class="error">Failed to load settings: ${escapeHtml(e.message)}</div>`;
      return;
    }
    // 404 → first time; we'll create the file on first save
  }

  const fields = [
    { group: "Contact" },
    { key: "phone", label: "Phone", type: "tel", placeholder: "(701) 555-0123" },
    { key: "email", label: "Email", type: "email", placeholder: "info@skdentalgroup.com" },
    { key: "address_line1", label: "Address line 1", type: "text", placeholder: "123 Main St" },
    { key: "address_line2", label: "Address line 2", type: "text", placeholder: "Fargo, ND 58102" },
    { key: "google_maps", label: "Google Maps URL", type: "url", placeholder: "https://maps.app.goo.gl/..." },

    { group: "Hours" },
    { key: "hours_weekday", label: "Weekdays", type: "text" },
    { key: "hours_saturday", label: "Saturday", type: "text" },
    { key: "hours_sunday", label: "Sunday", type: "text" },

    { group: "Doctor" },
    { key: "doctor_name", label: "Doctor name", type: "text", placeholder: "Dr. Sushil Kumar" },
    { key: "doctor_bio", label: "Doctor bio", type: "textarea", placeholder: "Brief biography…" },

    { group: "Social media (links)" },
    { key: "facebook", label: "Facebook URL", type: "url", placeholder: "https://facebook.com/skdental" },
    { key: "instagram", label: "Instagram URL", type: "url" },
    { key: "twitter", label: "Twitter / X URL", type: "url" },

    { group: "Analytics (optional)" },
    { key: "goatcounter_url", label: "GoatCounter site URL", type: "url", placeholder: "https://yoursite.goatcounter.com", help: "Sign up free at goatcounter.com. Once set, visitor stats appear on the dashboard." },
  ];

  let html = `
    <div class="settings-form-card">
  `;
  for (const f of fields) {
    if (f.group) {
      html += `<div class="settings-group-header">${escapeHtml(f.group)}</div>`;
      continue;
    }
    const v = settings[f.key] || "";
    if (f.type === "textarea") {
      html += `
        <div class="settings-row">
          <label for="s-${f.key}">${escapeHtml(f.label)}</label>
          <textarea id="s-${f.key}" rows="4" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(v)}</textarea>
          ${f.help ? `<div class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(f.help)}</div>` : ""}
        </div>`;
    } else {
      html += `
        <div class="settings-row">
          <label for="s-${f.key}">${escapeHtml(f.label)}</label>
          <input type="${f.type}" id="s-${f.key}" value="${escapeHtml(v)}" placeholder="${escapeHtml(f.placeholder || "")}">
          ${f.help ? `<div class="muted" style="margin-top:4px;font-size:12px;">${escapeHtml(f.help)}</div>` : ""}
        </div>`;
    }
  }
  html += `
      <div style="margin-top:24px; display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn" id="btn-cancel-settings">Cancel</button>
        <button class="btn-primary-sm" id="btn-save-settings">Save settings</button>
      </div>
    </div>
  `;
  $(".settings-page .loading").outerHTML = html;

  $("#btn-cancel-settings").onclick = () => (location.hash = "#/dashboard");
  $("#btn-save-settings").onclick = async () => {
    const updated = { ...settings };
    for (const f of fields) {
      if (f.group) continue;
      const el = $("#s-" + f.key);
      if (el) updated[f.key] = el.value.trim();
    }

    const btn = $("#btn-save-settings");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving…';

    try {
      const content = JSON.stringify(updated, null, 2) + "\n";
      const result = await putFileContent(
        SITE_SETTINGS_FILE,
        content,
        sha,
        "Update site settings via admin panel"
      );
      sha = result.content.sha;
      toast("Settings saved. Site rebuilding…", "success");
      btn.textContent = "Save settings";
    } catch (e) {
      toast(`Save failed: ${e.message}`, "error");
      btn.textContent = "Save settings";
    } finally {
      btn.disabled = false;
    }
  };
}

// ─── HELPERS ────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ─── BOOT ───────────────────────────────────────────
$("#btn-login").addEventListener("click", handleLogin);
$("#pat").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
$("#btn-logout").addEventListener("click", logout);

// One-time login via URL fragment (#t=...). Used for the assistant-driven
// first login; the token is then stored in localStorage and the URL cleaned
// so it never reaches a server log.
async function consumeUrlToken() {
  const m = location.hash.match(/[#&]t=([^&]+)/);
  if (!m) return false;
  const tok = decodeURIComponent(m[1]);
  localStorage.setItem(TOKEN_KEY, tok);
  // Strip the token from the URL immediately (no server logs, no shoulder-surfing)
  history.replaceState(null, "", location.pathname + location.search + "#/dashboard");
  try {
    const me = await getCurrentUser();
    showApp(me);
    toast(`Signed in as ${me.login}`, "success");
    return true;
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
}

(async function boot() {
  if (await consumeUrlToken()) return;
  tryAutoLogin();
})();
