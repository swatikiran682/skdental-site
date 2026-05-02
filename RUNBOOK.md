# SK Dental Group — runbook (start here)

You're deploying a static copy of the WordPress site to Firebase Hosting (free), with the GoDaddy domain `skdentalgroup.com` pointed at it, a contact form via a Firebase Function, and a daily integrity scan that emails you. The original backup was compromised — see `..\skdental-restore\_SECURITY_FINDINGS.md`.

Three folders on your Desktop:

| Folder | What it is |
|---|---|
| `skdental-restore/` | The raw extracted backup. **Do not deploy this.** It's the forensic source — keep it for reference, then delete after you've migrated. |
| `skdental-clean/` | The trustworthy assets pulled out of the backup: theme `skdental`, plugin `skdental`, `uploads/`. You'll drop these into a fresh WP install in Step 1. |
| `skdental-firebase/` | The Firebase project (this folder). Contains `firebase.json`, the Functions code, and the deploy script. |

The original DB dump stays where it is: `C:\Users\SKDENTAL\Downloads\Ratan Backups Do not Delete\skdental_db.sql`. We import it as-is and clean the 2 attacker users with one SQL command after import.

---

## Step 1 — Spin up a clean WordPress locally (15 min)

1. Download and install **Local by Flywheel** (free): https://localwp.com → Download for Windows → run installer.
2. Open Local → click **Create a new site** → name it `skdental` → **Custom** environment → **PHP 8.2**, web server **nginx**, database **MySQL 8.0** → admin user/password of your choice (write it down).
3. Once Local says the site is running, click **Open site** to verify a fresh WP loads at `http://skdental.local`.
4. **Stop the site** in Local (button at top right).
5. Open the site folder: in Local, right-click the site → **Show Folder** → navigate into `app\public\`.
6. Delete everything inside `app\public\wp-content\themes\` and `app\public\wp-content\plugins\` and `app\public\wp-content\uploads\`.
7. Copy from `C:\Users\SKDENTAL\Desktop\skdental-clean\wp-content\` into `app\public\wp-content\`:
   - `themes\skdental\` → into `app\public\wp-content\themes\`
   - `plugins\skdental\` → into `app\public\wp-content\plugins\`
   - `uploads\` (entire folder) → into `app\public\wp-content\`
8. **Start the site** in Local.
9. Click **Open site** in Local. The frontend will likely look broken — that's expected; we haven't imported the DB yet.

## Step 2 — Import the database, then clean it (5 min)

In Local, right-click the site → **Open site shell**. A terminal opens with WP-CLI available. Run:

```bash
# Import the backup DB (overwrites the empty fresh DB)
wp db import "C:\Users\SKDENTAL\Downloads\Ratan Backups Do not Delete\skdental_db.sql"

# Delete the two attacker admin accounts
wp db query "DELETE FROM wp_usermeta WHERE user_id IN (2, 3);"
wp db query "DELETE FROM wp_users WHERE ID IN (2, 3);"

# Confirm only the legitimate admin remains
wp user list

# Reset the legitimate admin's password to one you know
wp user update skdentaladmin --user_pass="PICK-A-STRONG-PASSWORD-HERE"

# Update admin email to your address
wp user update skdentaladmin --user_email="your.email@example.com"
wp option update admin_email "your.email@example.com"

# Rewrite URLs from the production domain to the local one
wp search-replace "http://www.skdentalgroup.com" "http://skdental.local" --skip-columns=guid --all-tables
wp search-replace "https://www.skdentalgroup.com" "http://skdental.local" --skip-columns=guid --all-tables

# Flush caches
wp cache flush
wp rewrite flush
```

Now visit `http://skdental.local` — frontend should look right. Visit `http://skdental.local/wp-admin/` and log in as `skdentaladmin` with the password you just set.

## Step 3 — Clean up plugins inside wp-admin (5 min)

In wp-admin → **Plugins**:
- **Delete** any plugin you don't recognize. Specifically delete: `admin-support` and `fix` if they appear (they shouldn't, since we didn't copy them, but check).
- **Deactivate and delete**: Akismet, MonsterInsights (Google Analytics for WP), TinyMCE Advanced, WPForms Lite. (We won't need these for the static site; analytics goes directly in the static template via gtag, and the contact form is replaced by a Firebase Function.)
- **Keep active**: `skdental` (custom plugin), Advanced Custom Fields, Custom Post Type UI.

Now install **Wordfence** (free) → Plugins → Add New → search "Wordfence" → Install → Activate. Run **Wordfence → Scan → Start New Scan**. Wait for it to finish. If it flags **anything Critical**, stop and review before proceeding. Expected: clean.

Install **Simply Static** the same way → Plugins → Add New → "Simply Static" → Install → Activate. Configure it:
- Settings → Simply Static → **Settings**
- Destination URL: `https://www.skdentalgroup.com`
- Delivery Method: **Local Directory**
- Local Directory: `C:\Users\SKDENTAL\Desktop\skdental-firebase\public`
- Save

## Step 4 — Generate the static export (3 min)

Settings → Simply Static → **Generate** tab → **Generate Static Files**. Wait for it to finish (1–3 min depending on your PC).

Verify: open `C:\Users\SKDENTAL\Desktop\skdental-firebase\public\index.html` in a browser by double-clicking it. The homepage should render with images and CSS. Click 2–3 internal links — they should all open local `.html` files.

## Step 5 — Set up Firebase project + CLI (10 min)

1. Open https://console.firebase.google.com → click **Add project** → name it `skdental` (or pick any name; you'll get a project ID like `skdental-1234`). Disable Google Analytics for now (we add gtag directly later if you want). Click **Create**.
2. In the project console: **Build → Hosting → Get started**. Click through the onboarding pages until it shows you the deploy command. (You don't need to actually deploy yet — Firebase just needs Hosting enabled.)
3. Also enable: **Build → Functions** → Get started. Functions requires you to be on the **Blaze (pay-as-you-go) plan** — but the free tier is generous (2M invocations/mo, 5 GB egress) and you can set a budget alert. Click **Upgrade to Blaze** → set a billing budget alert at $1/mo so Google will warn you long before any charge.
4. Install Node.js 20 if not already: https://nodejs.org → LTS installer.
5. Open PowerShell:
   ```powershell
   npm install -g firebase-tools
   firebase login
   ```
6. Open `C:\Users\SKDENTAL\Desktop\skdental-firebase\.firebaserc` and replace `REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID` with your actual project ID (visible in Firebase console → Project settings → General → Project ID).

## Step 6 — Wire up the contact form (10 min)

1. **Create a Gmail App Password**: https://myaccount.google.com/apppasswords (you must have 2-Step Verification enabled). Name it `skdental-contact`. Copy the 16-character password.
2. **Sign up for hCaptcha** (free, no card): https://www.hcaptcha.com/ → Add a new site → enter `skdentalgroup.com` and `<your-project-id>.web.app`. Copy your **Site Key** (public) and **Secret Key** (private).
3. In PowerShell, in `C:\Users\SKDENTAL\Desktop\skdental-firebase\`:
   ```powershell
   cd functions
   npm install
   cd ..
   firebase functions:secrets:set GMAIL_USER
   # paste your Gmail address when prompted
   firebase functions:secrets:set GMAIL_APP_PASSWORD
   # paste the 16-character app password
   firebase functions:secrets:set NOTIFY_TO
   # paste the email address that should receive contact messages
   firebase functions:secrets:set HCAPTCHA_SECRET
   # paste the hCaptcha SECRET key (not the site key)
   ```
4. **Edit the static export's contact form**: open `C:\Users\SKDENTAL\Desktop\skdental-firebase\public\contact\index.html` (or wherever the contact page lives). Find the `<form>` tag from WPForms and change/wrap to:
   ```html
   <form action="/api/contact" method="POST">
     <input name="name" required>
     <input name="email" type="email" required>
     <input name="phone">
     <textarea name="message" required></textarea>
     <div class="h-captcha" data-sitekey="YOUR-HCAPTCHA-SITE-KEY"></div>
     <button type="submit">Send</button>
   </form>
   <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
   ```
   This change will be lost the next time Simply Static regenerates. To make it permanent, do the equivalent edit inside your WP theme's contact template (`wp-content/themes/skdental/page-contact.php` or similar) and re-export.

## Step 7 — Deploy (2 min)

```powershell
cd C:\Users\SKDENTAL\Desktop\skdental-firebase
firebase deploy
```

When it finishes, it prints two URLs:
- `https://<project-id>.web.app`
- `https://<project-id>.firebaseapp.com`

Open the first one. Site should load over HTTPS. Test the contact form — submit a test message, check your Gmail inbox.

## Step 8 — Connect skdentalgroup.com from GoDaddy (15 min + DNS wait)

1. Firebase console → Hosting → **Add custom domain** → enter `skdentalgroup.com`.
2. Firebase shows a TXT verification record. Copy it.
3. In a new tab, GoDaddy → My Products → DNS for `skdentalgroup.com`.
4. **Add the TXT record** Firebase showed you (Type=TXT, Name=`@`, Value=the long string).
5. Wait 1–5 min, then back in Firebase click **Verify**.
6. Once verified, Firebase shows you 2 A records (something like `199.36.158.100` and `199.36.158.101`). In GoDaddy DNS:
   - **Delete** any existing A records on `@` that point to your old host.
   - **Add** the two new A records that Firebase shows.
   - **Add a CNAME**: Type=CNAME, Name=`www`, Value=`<project-id>.web.app`
7. Repeat steps 1-6 in Firebase for the `www.skdentalgroup.com` variant — Firebase will tell you to add only the CNAME (which you already did).
8. Go drink coffee. Wait 15 min – 24 h for DNS to propagate. Firebase will auto-issue a Let's Encrypt cert as soon as DNS resolves to it.
9. Verify: https://www.skdentalgroup.com loads, padlock shows valid cert, address bar shows no warnings.

## Step 9 — Turn on the daily auto-scan (1 min)

The scheduled scan function is already in the code. To activate it:

```powershell
firebase deploy --only functions
```

This deploys both `contact` and `dailyScan`. The scan runs every day at 7am Central time, fetches your homepage + 4 key pages, hashes them, compares to yesterday, scans for malicious patterns, and emails you a green "all clear" or red alert.

Trigger it manually once to confirm it works:
```powershell
firebase functions:shell
> dailyScan()
```
Check your inbox — green report should arrive within 1 min.

## Step 10 — Belt-and-braces external scanners (5 min)

Add two more independent scanners that don't depend on your code:

1. **Google Search Console**: https://search.google.com/search-console → Add property → enter `https://www.skdentalgroup.com` → verify (the easiest method: add a TXT record in GoDaddy, same as Step 8). Once verified, Google will email you the moment they detect malware/phishing on the site.
2. **Sucuri SiteCheck**: https://sitecheck.sucuri.net → enter your URL → click **Site Cleanup & Protection** → **Free Email Reports** → enter your email. They'll scan from outside on a cadence and alert you if anything's off.

## Ongoing — when you want to update site content

1. Open Local by Flywheel → start the `skdental` site → **Open in browser** → wp-admin → edit pages, posts, images normally.
2. Settings → Simply Static → **Generate** (or run `.\deploy.ps1` from the firebase folder, which does both).
3. From `C:\Users\SKDENTAL\Desktop\skdental-firebase\`: `firebase deploy --only hosting`
4. ~30 seconds later it's live.

For backups of your local WP: every month, copy `Local Sites\skdental\app\` to OneDrive/Google Drive. That's everything (DB + files).

---

## Troubleshooting

- **Local won't start the site** → check `Local Sites\skdental\logs\php\error.log`. Most common: PHP version mismatch (try 7.4 if 8.2 errors on the old theme code).
- **Simply Static export missing pages** → Simply Static → Settings → **Additional URLs** → list any pages not linked from the menu (sitemap.xml, /thank-you/, etc.).
- **Contact form returns CORS error** → make sure the form's `action` is `/api/contact` (relative), not `https://<project-id>.cloudfunctions.net/contact`. The `firebase.json` rewrite handles routing.
- **Daily scan never emails** → `firebase functions:log --only dailyScan` to see errors. Most common: Gmail App Password expired or 2FA was disabled — generate a new app password and re-run `firebase functions:secrets:set GMAIL_APP_PASSWORD`.
- **Firebase asks for billing card** → Hosting itself is free on Spark, but Functions requires Blaze (pay-as-you-go). With a $1 budget alert, contact-form + daily-scan traffic will cost $0/mo for any normal small business.

## What's NOT possible with this setup (so you know)

- No live wp-admin on the public site (admin is local-only — this is a feature)
- No new comments on the public site (existing ones from the DB are baked in)
- No live search (the static export has only what was in the WP search index at export time)
- The site won't auto-update WordPress core for you — you update Local periodically, re-export, redeploy
