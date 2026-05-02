const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

initializeApp();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const NOTIFY_TO = defineSecret("NOTIFY_TO");
const HCAPTCHA_SECRET = defineSecret("HCAPTCHA_SECRET");

const SITE_BASE = "https://www.skdentalgroup.com";
const PAGES_TO_SCAN = ["/", "/about/", "/services/", "/contact/"];
const SUSPICIOUS_PATTERNS = [
  /eval\s*\(/i,
  /base64_decode\s*\(/i,
  /<script[^>]*src=["']https?:\/\/(?!www\.googletagmanager\.com|www\.google-analytics\.com|www\.google\.com\/recaptcha|hcaptcha\.com|js\.hcaptcha\.com|www\.skdentalgroup\.com)[^"']+["']/i,
  /viagra|cialis|casino|porn|xxx-|sexy-g/i,
];

function makeMailer(user, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

exports.contact = onRequest(
  {
    cors: true,
    region: "us-central1",
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_TO, HCAPTCHA_SECRET],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    const { name, email, phone, message, "h-captcha-response": captcha } = req.body || {};
    if (!name || !email || !message) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    if (!captcha) {
      res.status(400).json({ error: "captcha_required" });
      return;
    }

    const verify = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: HCAPTCHA_SECRET.value(),
        response: captcha,
      }),
    });
    const verifyJson = await verify.json();
    if (!verifyJson.success) {
      res.status(400).json({ error: "captcha_failed" });
      return;
    }

    const transporter = makeMailer(GMAIL_USER.value(), GMAIL_APP_PASSWORD.value());
    await transporter.sendMail({
      from: `"skdentalgroup.com" <${GMAIL_USER.value()}>`,
      to: NOTIFY_TO.value(),
      replyTo: email,
      subject: `New contact form submission from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "(not given)"}\n\n${message}`,
    });

    res.status(200).json({ ok: true });
  }
);

exports.dailyScan = onSchedule(
  {
    schedule: "every day 07:00",
    timeZone: "America/Chicago",
    region: "us-central1",
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_TO],
  },
  async () => {
    const db = getFirestore();
    const findings = [];
    const newHashes = {};

    for (const path of PAGES_TO_SCAN) {
      const url = SITE_BASE + path;
      let body = "";
      let status = 0;
      try {
        const resp = await fetch(url, { redirect: "follow" });
        status = resp.status;
        body = await resp.text();
      } catch (err) {
        findings.push(`FETCH_FAIL ${url}: ${err.message}`);
        continue;
      }
      if (status !== 200) {
        findings.push(`HTTP_${status} ${url}`);
        continue;
      }

      const hash = crypto.createHash("sha256").update(body).digest("hex");
      newHashes[path] = hash;

      const snap = await db.collection("scan").doc(encodeURIComponent(path)).get();
      const lastHash = snap.exists ? snap.data().hash : null;
      if (lastHash && lastHash !== hash) {
        findings.push(`CONTENT_CHANGED ${url} (was ${lastHash.slice(0, 12)}, now ${hash.slice(0, 12)})`);
      }

      for (const pattern of SUSPICIOUS_PATTERNS) {
        const m = body.match(pattern);
        if (m) findings.push(`SUSPICIOUS_PATTERN ${url}: matched ${pattern} -> ${m[0].slice(0, 80)}`);
      }

      await db.collection("scan").doc(encodeURIComponent(path)).set({
        hash,
        lastScanned: FieldValue.serverTimestamp(),
        status,
      });
    }

    const ok = findings.length === 0;
    const subject = ok
      ? `[skdentalgroup.com] daily scan: all clear`
      : `[skdentalgroup.com] ALERT - ${findings.length} finding(s)`;
    const text = ok
      ? `Scanned ${PAGES_TO_SCAN.length} pages. No drift, no suspicious patterns.\n\nHashes:\n${JSON.stringify(newHashes, null, 2)}`
      : `Findings:\n\n${findings.join("\n")}\n\nHashes:\n${JSON.stringify(newHashes, null, 2)}`;

    const transporter = makeMailer(GMAIL_USER.value(), GMAIL_APP_PASSWORD.value());
    await transporter.sendMail({
      from: `"skdentalgroup.com scanner" <${GMAIL_USER.value()}>`,
      to: NOTIFY_TO.value(),
      subject,
      text,
    });
  }
);
