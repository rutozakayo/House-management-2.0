# Rental House Manager v2

A phone-first rental ledger and installable PWA for a small landlord: houses and tenants,
rent and water records, reminders, monthly history, exports, and an owner-only Safaricom
Daraja sandbox STK Push flow. Manual records remain in this browser; M-Pesa attempts and
verified receipts are stored in Neon.

---

## 1. What's inside

```
rental-house-manager/
├─ app/                      # Next.js auth pages and server routes
├─ components/               # owner sign-in form
├─ lib/                      # Better Auth, Neon/Drizzle, Daraja client
├─ public/                   # offline dashboard shell, PWA assets, icons
├─ tests/                    # offline, migration, and payment safeguard tests
├─ package.json              # Next.js, backend, and test scripts
├─ AUDIT.md                  # original v2 audit
└─ README.md
```

The dashboard assets remain static under `public/` so the ledger and manual entry work
offline. Owner authentication, M-Pesa requests, callbacks, and server payment status require
Next.js and the connected Neon database.

---

## 2. Run it locally

This is a Next.js server app; opening the HTML file directly or using a static file server
will not run authentication or M-Pesa routes. With the project environment configured:

```bash
npm install
npm run dev
```

The development server listens on `http://localhost:8080`. M-Pesa callbacks require a public
HTTPS preview or deployment; the dashboard itself continues to work offline after it loads.

---

## 3. Deploy with Vercel

Deploy this project as a Next.js application. Static hosting (for example, GitHub Pages or
Netlify Drop) cannot run the owner authentication, database, M-Pesa initiation, or callback
routes.

The connected Neon integration provides `DATABASE_URL`. The server also uses `BETTER_AUTH_SECRET`
and `MPESA_OWNER_EMAIL` for owner-only access, plus the server-side Daraja variables `Key`,
`Secret`, and `Passkey_2`. Never place those credentials in browser code or commit them.

The implemented Daraja endpoint and shortcode `174379` are sandbox-only and all prompts are in
KES. A sandbox confirmation is not a live rent payment. The app requires a KES currency setting
and mirrors a payment to the local rent ledger only after the callback and a server-side Daraja
query both confirm success.

## 4. Install it on your phone (PWA)

**Android / Chrome**
Open the site → menu (⋮) → **Install app** (or "Add to Home screen"). There is also an
**Install app** button in *Settings* when the browser offers it.

**iPhone / Safari**
Open the site in **Safari** → Share button → **Add to Home Screen** → Add.
(iOS does not show an install button; this is the manual way.)

Once installed it opens full-screen and keeps its own icon. Manual ledger entry, history,
exports, and backups work offline. Sign-in, M-Pesa prompts, and server status checks require
an internet connection. After you deploy an update, open the app once while online so its
cached files can refresh.

**Moving your existing records:**

- If you put the new files at the **same address** as the old app (same folder on the phone, or
  same web address), the old `rentalManagerV1` record is migrated automatically the first time you
  open the new version — nothing to do, and the old record is left untouched in case you need to
  go back.
- If you deploy to a **new address**, the browser treats it as a different site with empty local
  storage. Open `legacy-export.html` **from the old address** (or copy the JSON out with the browser
  console as described on that page), press *Download backup file*, then in the new app go to
  **Settings → Restore backup** and pick that file.

**Saving data:** houses, water readings, and manual payments remain in this browser's local
storage. M-Pesa attempts and server-confirmed receipts are persisted in Neon; a confirmed rent
payment is mirrored into the local ledger once. Clearing browser data removes the local copy,
so use *Settings → Download backup* regularly.

---

## 5. Daily use

1. **Working month** (top bar) — every payment, reading and statement is filed under this month.
   Use ‹ › to move between months.
2. **Houses** — add each house once: number, tenant, phone, monthly rent, water rate per unit.
   Edit anytime. **Vacate** keeps all history and stops charging rent after that month;
   **Delete** removes the tenant *and* all their records.
3. **Rent** — record manual payments (amount, date, note) or, after owner sign-in, send an
   M-Pesa sandbox STK prompt using the selected house phone and whole-number KES amount.
   Shortcode `174379` is sandbox-only. The server verifies callbacks and payment status before
   adding a receipt to the local rent ledger. "Mark balance paid" and WhatsApp/SMS reminders
   remain available.
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

Automated tests cover the offline dashboard, v1 data migration, phone/amount validation,
idempotency decisions, callback-state signatures, and exactly-once local ledger reconciliation.

```bash
npm test
npm run typecheck
npm run build
```

---

## 8. What was fixed and added

See [AUDIT.md](AUDIT.md) for the full list. Summary:

- Fixed: month field could be cleared and silently lose payments; UTC date bug on payment
  defaults; wrong "previous reading" when months were entered out of order; unescaped phone
  numbers in links; deleting a tenant wiped their whole history; no protection against
  unreadable/NaN readings; iOS zooming on focus and unstacked tables; misleading negative
  balances.
- Added: WhatsApp + SMS reminders, month-by-month history, arrears tracking, exports,
  installable offline PWA, and v1 data migration. M-Pesa adds owner-only email/password auth,
  an idempotent Daraja sandbox request, signed callback correlation, independent server-side
  status verification, and once-only receipt mirroring.

---

## 9. Known limits

- **Manual ledger data is device-local.** Houses, water readings, and manual payments do not
  sync between phones; use backup and restore to move them. Neon stores M-Pesa attempts and
  verified receipts only.
- **Daraja is sandbox-only.** The configured shortcode `174379` cannot collect live rent.
  Production collection requires the appropriate live Safaricom app, shortcode, passkey, and
  endpoint configuration.
- **Reminders are manual.** WhatsApp/SMS messages are prepared for the landlord to send; there
  is no scheduled messaging service.
- **Tenants do not have accounts or statements.** Authentication is restricted to the owner.
  Caretaker roles and tenant portals are not included.
