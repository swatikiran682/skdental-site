# Cloudflare Free WAF — 5-minute setup

You requested **Tier 3 firewall** (Cloudflare in front of Firebase). I can't do this end-to-end because Cloudflare requires you to verify your email and you must change nameservers at GoDaddy with your account login. But the steps below are quick and one-time.

When done, every request to `skdentalgroup.com` is filtered by Cloudflare's Web Application Firewall **before** it ever reaches Firebase. Bot scanners, SQL-injection probes (no DB but still), known-bad IPs, and DDoS traffic get blocked at Cloudflare's edge.

**Cost: $0/mo, no credit card required.**

---

## Step 1 — Sign up for Cloudflare (2 min)

1. Open https://dash.cloudflare.com/sign-up in Chrome
2. Email: `swatikiran682@gmail.com` (or any email you want — verification email will go here)
3. Password: pick a strong one, write it down
4. Click **Create Account**
5. Check your email → click verification link → return to Cloudflare dashboard

## Step 2 — Add your domain (1 min)

1. On the Cloudflare dashboard, click **+ Add a domain** (or "Add site")
2. Type `skdentalgroup.com` → click **Continue**
3. **Plan picker**: scroll all the way down → click **Free** ($0/mo) → click **Continue**
4. Cloudflare will scan your existing DNS records at GoDaddy. After a few seconds you'll see a list of records (the A `199.36.158.100`, the TXT `hosting-site=sk-dentals-142f5`, plus your existing `admin`, `mail`, `autodiscover`, `calendar` records that we left untouched).
5. **Important**: for the `A` record on `@` (199.36.158.100), make sure the orange **Proxy status** cloud is **ON** (orange, not gray). This is what enables the WAF.
6. Leave the other records as-is (don't proxy `mail` or `autodiscover` since those route email).
7. Click **Continue**

## Step 3 — Change nameservers at GoDaddy (1 min)

Cloudflare will now show you **two nameservers** that look like:

```
adam.ns.cloudflare.com
nina.ns.cloudflare.com
```

(Yours will have different first names — Cloudflare assigns random pairs.)

**Copy both.** Then:

1. Open https://dcc.godaddy.com/control/portfolio in another tab
2. Click on `skdentalgroup.com` → **DNS** tab → **Nameservers** sub-tab
3. Click **Change Nameservers**
4. Choose **Enter my own nameservers (advanced)**
5. Replace the two existing GoDaddy nameservers (`ns15.domaincontrol.com` and `ns16.domaincontrol.com`) with the two Cloudflare ones
6. Save

## Step 4 — Tell Cloudflare you're done (30 sec)

Back in Cloudflare:
1. Click **Done, check nameservers**
2. Cloudflare will start verifying. This takes 5 minutes – 24 hours (usually under an hour).
3. You'll get an email when it's active.

## Step 5 — Configure WAF (1 min, after activation)

Once the domain shows "Active" in Cloudflare:

1. In the left sidebar of Cloudflare, click **Security** → **WAF**
2. Make sure these are **ON**:
   - **Cloudflare Managed Ruleset** (free tier)
   - **OWASP ModSecurity Core Rule Set** (free tier)
3. Click **Security** → **Bots** → enable **Bot Fight Mode** (free tier — auto-blocks known bad bots)
4. Click **Security** → **Settings** → set **Security Level** to "Medium"
5. Click **SSL/TLS** → **Overview** → set encryption to **Full (strict)** (since Firebase has a real cert)

## Step 6 — Verify it's working

1. Open https://skdentalgroup.com in a fresh browser tab
2. Right-click → **View page source** → press Ctrl+F → search `cf-ray` — you should see a Cloudflare response header in the page (or check Dev Tools → Network → any request → Response Headers)
3. Visit https://www.cloudflare.com/cdn-cgi/trace from the same site — should show your Cloudflare data center

That confirms traffic is now flowing **through Cloudflare → Firebase**, not directly to Firebase.

---

## What you get with the free Cloudflare plan

| Feature | Free tier |
|---|---|
| Web Application Firewall (WAF) | ✅ Cloudflare Managed Ruleset |
| Bot protection | ✅ Bot Fight Mode |
| DDoS protection | ✅ Unmetered Layer 3/4/7 |
| Rate limiting | ✅ 10 rules |
| SSL/TLS | ✅ Universal SSL (auto-renew) |
| CDN caching | ✅ Worldwide |
| Analytics | ✅ Last 24h |
| Page Rules | ✅ 3 rules |

## Things to keep in mind

- After Cloudflare activation, the **A records you previously added in GoDaddy don't matter anymore** — Cloudflare DNS now handles `skdentalgroup.com`. Cloudflare scanned GoDaddy records, so your `199.36.158.100` and TXT record are already replicated.
- Email DNS (mail., autodiscover.) was set to **DNS-only** (gray cloud) by Cloudflare automatically — emails will keep working through whatever provider you use.
- If anything breaks, you can always change nameservers back to GoDaddy in 5 min — no commitment.

---

## After Cloudflare is live

Tell me, and I'll add a **Cloudflare-only firewall rule** that blocks the most common malware-scan patterns — things like:

- Requests to `/wp-admin/`, `/wp-login.php`, `/.env`, `/xmlrpc.php` (since you don't have WordPress, anyone hitting these is probing for vulnerabilities)
- Requests with suspicious user agents
- Repeated failed requests from the same IP
