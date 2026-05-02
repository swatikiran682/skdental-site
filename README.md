# SK Dental Group — static website

Live: https://www.skdentalgroup.com (custom domain pending DNS verification) and https://sk-dentals-142f5.web.app

## How to update content

Any commit to `main` triggers GitHub Actions, which deploys the contents of `public/` to Firebase Hosting.

To edit a page from anywhere:

1. Browse to https://github.com/swatikiran682/skdental-site
2. Open `public/<page>/index.html`
3. Click the pencil icon (top-right of the file view) to edit
4. Make your changes, scroll down, click **Commit changes**
5. Wait ~60 seconds — site is live with your edit

## Local dev (advanced, optional)

The `public/` folder is a Simply Static export from a local WordPress install. To regenerate it from scratch, see notes in `RUNBOOK.md`.
