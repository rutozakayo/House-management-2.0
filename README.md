# Rental House Manager v2

A phone-first, offline-capable app for a small landlord: houses and tenants, monthly rent,
water meter readings and bills, reminders over WhatsApp/SMS, monthly history, printing and
CSV/JSON export. No server, no account, no dependencies at runtime — just static files.

---

## 1. What's inside

```
rental-house-manager/
├─ index.html               # app shell (all screens)
├─ styles.css               # design system, dark mode, print styles
├─ app.js                   # all logic (storage, billing, reminders, export, PWA)
├─ manifest.webmanifest     # PWA manifest (installable app)
├─ sw.js                    # service worker (offline app shell)
├─ icons/                   # app icons + favicon
├─ legacy-export.html       # one-off helper to move data out of the old version
├─ tests/                   # dev-only automated tests (not needed in production)
├─ package.json             # dev tooling only (test runner)
├─ AUDIT.md                 # what was broken in v1 and how it was fixed
└─ README.md
```

Everything a browser needs is `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`,
`sw.js` and `icons/`. `tests/`, `package.json` and `node_modules/` are optional — you can
deploy without them.

---

## 2. Run it locally (2 ways)

**A. Just open it**
Double-click `index.html`. Everything works except the "install as app" / offline caching,
because browsers only allow service workers on `http(s)://` (or `localhost`).

**B. Serve it (recommended, needed to test offline + install)**

```bash
cd rental-house-manager
python3 -m http.server 8080
# then open http://localhost:8080
```

or, with Node installed:

```bash
npx serve . -l 8080
```

On a phone in the same Wi-Fi, open `http://<your-computer-IP>:8080`. Note: service workers
need HTTPS or localhost, so install/offline only works on the deployed HTTPS site (or on
localhost).

---

## 3. Deploy for free

All three options give you HTTPS + a public URL, which is what the installable offline app
needs. Total time: about 2 minutes.

### Option A — Netlify Drop (fastest, no Git)

1. Open `https://app.netlify.com/drop`.
2. Drag the **`rental-house-manager` folder** (the folder that contains `index.html`) onto the page.
3. Wait ~20 seconds. You get a URL like `https://calm-otter-12345.netlify.app`.
4. Optional: "Site configuration → Change site name" to get something like
   `https://rents-mine.netlify.app`.
5. Open the URL on your phone. Done.

Free tier is fine for this (static files, tiny traffic). No credit card required.

### Option B — GitHub Pages (free, versioned, easy to update)

1. Create a new **public** repository on GitHub, e.g. `rental-house-manager`.
2. Upload the contents of this folder (all files at the repo root, `icons/` included).
   Either drag-and-drop in the GitHub web UI, or:
   ```bash
   cd rental-house-manager
   git init && git add . && git commit -m "Rental House Manager v2"
   git branch -M main
   git remote add origin https://github.com/<your-user>/rental-house-manager.git
   git push -u origin main
   ```
3. Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   Branch: `main`, folder `/ (root)` → Save**.
4. Wait 1–2 minutes. Your app is at `https://<your-user>.github.io/rental-house-manager/`.
5. To update later: change files, commit, push. The site refreshes in a minute or two.

All paths in the app are relative, so it works in a sub-folder like that with no changes.

### Option C — Cloudflare Pages

1. Go to `https://pages.cloudflare.com` → sign in → **Create a project → Upload assets**.
2. Upload the folder, project name becomes part of the URL
   (`https://<project>.pages.dev`).
3. Deploy. Free, unlimited bandwidth for static assets.

> Reminder: use the folder that **directly contains `index.html`**. Uploading the parent
> folder creates a URL like `/rental-house-manager/index.html` and the app will still work,
> but the "start URL" for the installed app is cleaner if the files are at the root.

---

## 4. Install it on your phone (PWA)

**Android / Chrome**
Open the site → menu (⋮) → **Install app** (or "Add to Home screen"). There is also an
**Install app** button in *Settings* when the browser offers it.

**iPhone / Safari**
Open the site in **Safari** → Share button → **Add to Home Screen** → Add.
(iOS does not show an install button; this is the manual way.)

Once installed it opens full-screen, works with no internet, and keeps its own icon.
After you deploy an update, open the app once while online — the page itself is fetched fresh,
and the cached files are refreshed in the background.

**Moving your existing records:**

- If you put the new files at the **same address** as the old app (same folder on the phone, or
  same web address), the old `rentalManagerV1` record is migrated automatically the first time you
  open the new version — nothing to do, and the old record is left untouched in case you need to
  go back.
- If you deploy to a **new address** (a new Netlify / GitHub Pages URL), the browser treats it as a
  different site with empty storage. Open `legacy-export.html` **from the old address** (or copy the
  JSON out with the browser console as described on that page), press *Download backup file*, then
  in the new app go to **Settings → Restore backup** and pick that file.

**Saving data:** the app stores everything in the browser's local storage for that site.
Deleting the app icon does not delete data, but "Clear website data" does. Use
*Settings → Download backup* to keep a copy.

---

## 5. Daily use

1. **Working month** (top bar) — every payment, reading and statement is filed under this month.
   Use ‹ › to move between months.
2. **Houses** — add each house once: number, tenant, phone, monthly rent, water rate per unit.
   Edit anytime. **Vacate** keeps all history and stops charging rent after that month;
   **Delete** removes the tenant *and* all their records.
3. **Rent** — record each payment (amount, date, note). "Mark balance paid" settles the rest in
   one tap. Each house shows a status line plus **WhatsApp** / **SMS** buttons that pre-fill a
   message with the exact balance.
4. **Water** — enter the previous and current meter reading; the app computes units × rate and
   the bill. Record the payment the same way. Readings can be corrected by saving the month
   again, or deleted.
5. **History** — every month with rent due/paid/outstanding, water billed/paid/outstanding and a
   running total. Tap a row to open that month.
6. **Summary** — KPIs, the month's table with totals, and **unpaid from earlier months** (arrears),
   including tenants who already vacated.
7. **Settings** — your own phone (for "Message all"), country dialling code, currency, the
   clear-by date used in reminders, theme, backup/restore, CSV exports, install.

### WhatsApp / SMS details

Messages open `https://wa.me/<number>?text=...`, which opens the WhatsApp app or WhatsApp Web
with the text ready — you still tap send. Numbers are normalised with the country code from
*Settings* (default `256`): `0771234567` → `256771234567`, `+256…` stays as is, `00256…` loses
the `00`. Set the code to your country (e.g. `254` Kenya, `255` Tanzania, `234` Nigeria,
`65` Singapore, `1` USA/Canada) before using the buttons.

SMS uses `sms:` with the same text — useful when a tenant has no WhatsApp.

---

## 6. Backups, CSV and printing

- **Download backup** — one JSON file with houses, payments, readings and settings.
  **Restore backup** replaces the current data after a confirmation.
- **This month CSV** — a statement you can open in Excel/Sheets (with BOM so accents and
  amounts display correctly).
- **All payments CSV** — full ledger, one row per payment.
- **History CSV** — the month-by-month table.
- **Print** (Summary tab) — builds a clean A4 statement: houses, balances, arrears and the
  payments received, then opens the print dialog. On a phone you can "Save as PDF" from there.

---

## 7. Tests

The logic is covered by automated browser-DOM tests (jsdom), including a full v1 → v2
migration of your existing data.

```bash
cd rental-house-manager
npm install        # once, installs jsdom (dev only)
npm test
```

Expected: `app: PASS 88 / FAIL 0`, `legacy: PASS 29 / FAIL 0`, `bridge: PASS 7 / FAIL 0`.

---

## 8. What was fixed and added

See [AUDIT.md](AUDIT.md) for the full list. Summary:

- Fixed: month field could be cleared and silently lose payments; UTC date bug on payment
  defaults; wrong "previous reading" when months were entered out of order; unescaped phone
  numbers in links; deleting a tenant wiped their whole history; no protection against
  unreadable/NaN readings; iOS zooming on focus and unstacked tables; misleading negative
  balances.
- Added: WhatsApp + SMS reminders (with one-tap "message all"), month-by-month history,
  arrears tracking that survives vacating, print statement, CSV exports, JSON backup/restore,
  vacate/reinstate, editable payment notes, installable offline PWA, dark mode, and a
  data migration from the old `rentalManagerV1` storage.

---

## 9. Known limits (what would need a backend)

- **Data lives on one device/browser.** Two phones will not see the same records. That is the
  trade-off for having no server, no login and no monthly cost. Moving to a new phone works via
  backup → restore.
- **Reminders are manual.** The app opens WhatsApp/SMS with the message ready; automatic
  scheduled sending needs a server with WhatsApp Business API / SMS gateway credentials.
- **Tenants cannot log in** to see their own statement. That needs authentication, a database
  and a hosted API (e.g. Supabase/Firebase + a small API), and would change this from a static
  app to a hosted service.
- **No multi-user roles** (caretaker vs owner) for the same reason.

If you later want any of those, the current data model (`houses`, `payments`, `readings`,
`settings`) maps one-to-one onto database tables, so it can be moved without redesigning the app.
