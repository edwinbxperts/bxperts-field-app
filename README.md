# bXperts Field Portal — Deployment Guide

## What's in this repo
```
/src/App.jsx                          ← Main React app
/api/claude-proxy/index.js            ← Azure Function (secure API proxy)
/staticwebapp.config.json             ← Azure routing config
/.github/workflows/deploy.yml         ← Auto-deploy on every GitHub push
/public/index.html                    ← HTML shell with MSAL loaded
```

---

## Step 1 — Fill in your Azure AD credentials
Open `src/App.jsx` and update the top section:

```js
const AZURE_CONFIG = {
  clientId:    "PASTE_YOUR_CLIENT_ID_HERE",
  tenantId:    "PASTE_YOUR_TENANT_ID_HERE",
  redirectUri: "https://bxperts.app",
  scopes:      ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"],
};
```

**Where to find these:**
- Azure Portal → App Registrations → bXperts Field Portal
- Copy **Application (client) ID** → clientId
- Copy **Directory (tenant) ID** → tenantId

---

## Step 2 — Register Azure AD App (if not done yet)
1. Azure Portal → **App Registrations** → New registration
2. Name: `bXperts Field Portal`
3. Redirect URI (Single-page application): `https://bxperts.app`
4. API Permissions → Add:
   - `User.Read`
   - `Files.ReadWrite`
   - `Sites.ReadWrite.All`
5. Grant admin consent

---

## Step 3 — Push this code to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bxperts-field-app.git
git push -u origin main
```

---

## Step 4 — Finish Azure Static Web App setup
1. In Azure Portal, finish creating the Static Web App
2. Connect to your GitHub repo `bxperts-field-app`, branch `main`
3. Build preset: **React**
4. App location: `/`
5. Output location: `build`
6. Azure will add the deploy token to GitHub automatically

---

## Step 5 — Add the Anthropic API Key (IMPORTANT — never in code)
1. Azure Portal → Your Static Web App → **Configuration** → Application settings
2. Add new setting:
   - Name:  `ANTHROPIC_API_KEY`
   - Value: `your-anthropic-api-key-from-console.anthropic.com`
3. Also add:
   - Name:  `ALLOWED_ORIGIN`
   - Value: `https://bxperts.app`
4. Click Save

---

## Step 6 — Connect bxperts.app domain
**In Azure:**
1. Static Web App → **Custom domains** → Add
2. Enter: `bxperts.app`
3. Azure gives you a TXT record to verify ownership

**In GoDaddy:**
1. Domains → bxperts.app → DNS → Add record
2. Add the **TXT record** Azure gave you (for verification)
3. Add a **CNAME record**:
   - Name: `www`
   - Value: your Azure URL (e.g. `bxperts-app.azurestaticapps.net`)
4. For the root domain (`bxperts.app`), add an **A record** or **ALIAS**:
   - Point to the Azure-provided IP

---

## Step 7 — Verify & test
1. Wait ~10 min for DNS to propagate
2. Visit `https://bxperts.app`
3. Sign in with your `@bxperts.com` Microsoft account
4. Confirm your assignments load from monday.com

---

## Ongoing updates
Any time you push to the `main` branch on GitHub, the app automatically rebuilds and deploys. No manual steps needed.
