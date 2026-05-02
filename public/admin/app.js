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
    <div class="visual-editor">
      <div class="vis-toolbar">
        <span class="vis-hint">
          <span class="hint-step"><kbd>1</kbd> Hover any text</span>
          <span class="hint-arrow">→</span>
          <span class="hint-step"><kbd>2</kbd> Click to edit, or use the X button to delete</span>
          <span class="hint-arrow">→</span>
          <span class="hint-step"><kbd>3</kbd> Save changes (top right)</span>
        </span>
      </div>
      <iframe id="preview-frame" class="preview-frame full" sandbox="allow-same-origin allow-scripts"></iframe>
    </div>
  `;

  const iframe = $("#preview-frame");
  let injected = editorState.originalContent;
  if (!/<base\s/i.test(injected)) {
    injected = injected.replace(/<head([^>]*)>/i, '<head$1>\n<base href="https://skdentalgroup.com/">');
  }
  iframe.srcdoc = injected;

  iframe.addEventListener("load", () => {
    injectVisualEditMode(iframe);
  }, { once: true });

  $("#btn-save").onclick = () => saveChanges(page);
  $("#btn-revert").onclick = () => {
    if (confirm("Discard your unsaved changes? The page will reload from GitHub.")) {
      renderEditor(EDITABLE_PAGES.indexOf(page) === -1 ? 0 : EDITABLE_PAGES.indexOf(page));
    }
  };

  setMeta("Loaded from GitHub. Hover any text to start editing.", "saved");
}

function injectVisualEditMode(iframe) {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !doc.body) return;

  // Edit-mode CSS injected into the iframe document
  const style = doc.createElement("style");
  style.id = "__admin-edit-styles";
  style.textContent = `
    [data-admin-hover] {
      outline: 2px dashed #2c7be5 !important;
      cursor: pointer !important;
      position: relative !important;
    }
    [data-admin-selected] {
      outline: 2px solid #f98d00 !important;
      background-color: rgba(255, 251, 230, 0.6) !important;
    }
    [data-admin-editing] {
      outline: 2px solid #f98d00 !important;
      background-color: #fff !important;
    }
    [data-admin-modified]::after {
      content: "● modified";
      position: absolute;
      top: -22px; right: 0;
      font-family: -apple-system, sans-serif;
      font-size: 10px;
      background: #1f8a4f; color: #fff;
      padding: 2px 6px; border-radius: 3px;
      pointer-events: none;
      z-index: 100000;
    }
    .__admin-delete-btn {
      position: absolute;
      top: -14px; right: -14px;
      width: 28px; height: 28px;
      background: #c53030; color: #fff;
      border: 2px solid #fff;
      border-radius: 50%;
      font-family: -apple-system, sans-serif;
      font-size: 14px; font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      z-index: 100001;
      line-height: 1;
    }
    .__admin-delete-btn:hover { background: #9b2424; transform: scale(1.1); }
  `;
  doc.head.appendChild(style);

  // Disable existing scripts' navigation by intercepting clicks on links
  doc.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", (e) => e.preventDefault());
  });
  // Disable form submissions
  doc.querySelectorAll("form").forEach((f) => {
    f.addEventListener("submit", (e) => e.preventDefault());
  });

  let hovered = null;
  let selected = null;

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const skip = ["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "META", "LINK", "BASE", "TITLE", "NOSCRIPT", "IFRAME"];
    if (skip.includes(el.tagName)) return false;
    // Skip our own injected helpers
    if (el.classList && el.classList.contains("__admin-delete-btn")) return false;
    if (el.id === "__admin-edit-styles") return false;
    // Must have direct text content (not just nested)
    const hasOwnText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    // Also allow images & buttons (purely structural elements)
    const isMedia = ["IMG", "BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    return hasOwnText || isMedia;
  }

  function clearHover() {
    if (hovered) {
      hovered.removeAttribute("data-admin-hover");
      hovered = null;
    }
  }

  function clearSelection() {
    if (selected) {
      selected.removeAttribute("data-admin-selected");
      selected.removeAttribute("data-admin-editing");
      selected.contentEditable = "false";
      const btn = selected.querySelector(":scope > .__admin-delete-btn");
      if (btn) btn.remove();
      selected = null;
    }
  }

  function selectElement(el) {
    clearSelection();
    if (!isEditable(el)) return;
    selected = el;
    el.setAttribute("data-admin-selected", "");

    // Add delete button overlay on the element
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
    const btn = doc.createElement("button");
    btn.className = "__admin-delete-btn";
    btn.title = "Delete this element";
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const what = (el.textContent || el.tagName).trim().slice(0, 40);
      if (win.confirm(`Delete this element? "${what}…"`)) {
        el.remove();
        selected = null;
        markDirty();
      }
    });
    el.appendChild(btn);

    // Make the element editable on next click
    setTimeout(() => {
      if (!selected) return;
      selected.setAttribute("data-admin-editing", "");
      selected.removeAttribute("data-admin-selected");
      selected.contentEditable = "true";
      // Place caret at end
      const range = doc.createRange();
      range.selectNodeContents(selected);
      range.collapse(false);
      const sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      selected.focus();
    }, 0);
  }

  doc.addEventListener("mouseover", (e) => {
    if (selected) return;
    const t = e.target;
    if (!isEditable(t) || t === hovered) return;
    clearHover();
    t.setAttribute("data-admin-hover", "");
    hovered = t;
  });
  doc.addEventListener("mouseout", (e) => {
    if (e.target === hovered) {
      clearHover();
    }
  });

  doc.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList && target.classList.contains("__admin-delete-btn")) return;
    if (selected && selected.contains(target)) return; // already editing this; allow text selection
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    selectElement(target);
  }, true);

  doc.addEventListener("input", (e) => {
    if (e.target === selected || (selected && selected.contains(e.target))) {
      markDirty();
      selected.setAttribute("data-admin-modified", "");
      // If the edited element is or wraps a single anchor with mailto:/tel:,
      // sync the href to the new visible text. This catches the common
      // "I edited the email address shown on the page" case where the
      // mailto: link would otherwise still point at the old address.
      syncMailtoTelHrefs(selected);
    }
  });

  function syncMailtoTelHrefs(root) {
    const candidates = root.tagName === "A" ? [root] : root.querySelectorAll("a");
    candidates.forEach((a) => {
      const href = (a.getAttribute("href") || "").trim().toLowerCase();
      if (!href.startsWith("mailto:") && !href.startsWith("tel:")) return;
      const txt = (a.textContent || "").trim();
      if (!txt) return;
      const scheme = href.startsWith("mailto:") ? "mailto:" : "tel:";
      // For tel:, allow the href to stay clean (digits only)
      const cleaned = scheme === "tel:" ? txt.replace(/[^\d+]/g, "") : txt;
      if (!cleaned) return;
      a.setAttribute("href", scheme + cleaned);
    });
  }

  // Click outside (in parent) to deselect — use parent message
  win.__exitEdit = clearSelection;

  function markDirty() {
    if (!editorState.dirty) {
      editorState.dirty = true;
      $("#btn-save").disabled = false;
      $("#btn-revert").disabled = false;
      setMeta("Unsaved changes — click Save changes when ready", "modified");
    }
  }
}

function setMeta(text, cls) {
  const el = $("#editor-meta");
  el.innerHTML = `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function serializeIframeForSave(iframe) {
  const doc = iframe.contentDocument;
  if (!doc) return null;

  // Clone so we don't mutate what the user is looking at
  const clone = doc.documentElement.cloneNode(true);

  // Strip our injected helpers
  const ourStyle = clone.querySelector("#__admin-edit-styles");
  if (ourStyle) ourStyle.remove();
  clone.querySelectorAll(".__admin-delete-btn").forEach((b) => b.remove());

  // Remove our edit-mode attributes/classes from every element
  clone.querySelectorAll("[data-admin-hover]").forEach((e) => e.removeAttribute("data-admin-hover"));
  clone.querySelectorAll("[data-admin-selected]").forEach((e) => e.removeAttribute("data-admin-selected"));
  clone.querySelectorAll("[data-admin-editing]").forEach((e) => e.removeAttribute("data-admin-editing"));
  clone.querySelectorAll("[data-admin-modified]").forEach((e) => e.removeAttribute("data-admin-modified"));
  clone.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));

  // Remove the <base> we injected for asset resolution
  const base = clone.querySelector('base[href="https://skdentalgroup.com/"]');
  if (base) base.remove();

  // Strip inline position:relative we added during selection (best-effort)
  clone.querySelectorAll('[style*="position: relative"]').forEach((e) => {
    // Only strip if it's literally just position:relative (we added it).
    // If the element had other inline styles, leave them.
    const s = e.getAttribute("style") || "";
    const cleaned = s
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p && !/^position\s*:\s*relative/i.test(p))
      .join("; ");
    if (cleaned !== s.replace(/;\s*$/, "")) {
      if (cleaned) e.setAttribute("style", cleaned);
      else e.removeAttribute("style");
    }
  });

  return "<!DOCTYPE html>\n" + clone.outerHTML;
}

async function saveChanges(page) {
  const iframe = $("#preview-frame");
  const newContent = serializeIframeForSave(iframe);
  if (!newContent || newContent === editorState.originalContent) {
    toast("Nothing to save", "");
    return;
  }

  const btn = $("#btn-save");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const message = `Edit ${page.title} via admin panel`;
    const result = await putFileContent(page.path, newContent, editorState.sha, message);
    editorState.originalContent = newContent;
    editorState.sha = result.content.sha;
    editorState.dirty = false;
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
            <img id="qr-img" alt="QR code preview" />
          </div>
          <div class="qr-info" id="qr-info"></div>
        </div>
      </div>
    </section>
  `;

  // Use api.qrserver.com — server-rendered QR codes via simple image URL.
  // No JS library, no canvas issues, always works.
  let currentUrl = "";

  function buildApiUrl() {
    const text = $("#qr-url").value || "https://skdentalgroup.com";
    const size = parseInt($("#qr-size").value, 10) || 400;
    const fg = ($("#qr-color").value || "#0660b0").replace("#", "");
    const bg = ($("#qr-bg").value || "#ffffff").replace("#", "");
    const level = $("#qr-level").value || "M";
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&color=${fg}&bgcolor=${bg}&ecc=${level}&margin=10`;
  }

  function refresh() {
    const apiUrl = buildApiUrl();
    currentUrl = apiUrl;
    const img = $("#qr-img");
    img.src = apiUrl;
    const text = $("#qr-url").value || "https://skdentalgroup.com";
    const size = parseInt($("#qr-size").value, 10) || 400;
    $("#qr-info").innerHTML =
      `<span class="muted">Encodes <code>${escapeHtml(text)}</code> at ${size}×${size}px</span>`;
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

  $("#qr-download").addEventListener("click", async () => {
    const btn = $("#qr-download");
    const original = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Preparing…';
    try {
      const resp = await fetch(currentUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const text = $("#qr-url").value || "qr-code";
      const fname = "qr-" + text.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) + ".png";
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast(`Downloaded ${fname}`, "success");
    } catch (e) {
      toast(`Download failed: ${e.message}. Try right-clicking the QR image and "Save image as".`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
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
