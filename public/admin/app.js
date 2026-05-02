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
  $(".brand").textContent = `SK Dental Admin — ${user.login}`;
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
function renderDashboard() {
  const main = $("#main");
  main.innerHTML = `
    <section class="dashboard">
      <h1>Pages you can edit</h1>
      <p class="subtitle">Click a page to open the editor. Saving commits to GitHub and the live site updates within ~60 seconds.</p>
      <div class="page-grid" id="page-grid"></div>
    </section>
  `;
  const grid = $("#page-grid");
  EDITABLE_PAGES.forEach((p, i) => {
    const card = document.createElement("a");
    card.className = "page-card";
    card.href = `#/edit/${i}`;
    card.innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <div class="muted">${escapeHtml(p.description)}</div>
      <div class="path">${escapeHtml(p.path)}</div>
    `;
    grid.appendChild(card);
  });
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
        <a href="#/dashboard">← All pages</a>
        <h2>${escapeHtml(page.title)}</h2>
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

tryAutoLogin();
