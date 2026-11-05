# Audit of the original `Rental House Manager.html`

Scope: every function in the original single-file app — houses, rent, water, summary,
reminders, storage — was read line by line, then the behaviour was reproduced in automated
tests so each fix is verified rather than assumed.

Legend: **Severity** — 🔴 loses or corrupts data · 🟠 wrong numbers/wrong message · 🟡 confusing,
fragile or inaccessible.

---

## 1. Bugs found and fixed

| # | Severity | Where | Problem in v1 | Fix in v2 |
|---|----------|-------|----------------|-----------|
| 1 | 🔴 | `rentForm` / `waterPayForm` submit | The payment was saved with `month: $('month').value`. The month field can be cleared (Chrome shows an ×, iOS renders it as free text), so payments were filed under `""` and then disappeared from every view — rent, water, summary and history all filter by month. | Month is validated (`/^\d{4}-\d{2}$/`); an invalid/empty value falls back to the last valid working month. A payment can never be stored without a real month. |
| 2 | 🔴 | `deleteHouse()` | "Remove tenant" deleted the house **and** every payment and reading for it. One tap destroyed the rent history of a tenant who had just moved out. | Two separate actions: **Vacate** (keeps all history, stops charging rent from that month, excluded from new payments) and **Delete** (explicit destructive confirm that names the data being removed). |
| 3 | 🟠 | `lastReadingFor()` | Returned `list[list.length - 1]` — the last *inserted* reading, not the latest *month*. If you back-filled an older month, the auto-filled "previous reading" belonged to the wrong month, so units and the bill were wrong (or a negative consumption was rejected and you could not save at all). | `previousReading(house, month)` picks the latest reading **strictly before the selected month**, falling back to the newest one. Back-filling months now works in any order. |
| 4 | 🟠 | `today()` | `new Date().toISOString().slice(0,10)` is UTC. East of UTC (e.g. UTC+3) a payment recorded before 03:00 got *yesterday's* date; west of UTC it got tomorrow's. | Local-date `today()` built from `getFullYear/getMonth/getDate`. |
| 5 | 🟠 | `monthLabel()` | `monthLabel('')` (or a half-typed value) produced the literal string "Invalid Date" in every heading and in WhatsApp/SMS text. | Guarded: the working month is always a valid `YYYY-MM`; labels are derived only from validated values. |
| 6 | 🟠 | `sms:` links in `renderRent()` | `href="${smsLink(h.phone, ...)}"` inserted the phone number into the attribute without escaping. A quote or angle bracket in the phone field broke the markup (and could inject attributes). | Every value that reaches HTML goes through `esc()`; phone numbers are normalised to digits before being placed in `href`. |
| 7 | 🟠 | `waterFigures()` / summary | Recording a water payment before entering the reading produced `billed = 0`, so the balance was negative and the summary showed a negative "Water balance" with no explanation. Overpayments on rent showed negative balances too. | Balances are only reported against an actual bill; "outstanding" is clamped at zero for totals; a settled/overpaid account reads as paid instead of a negative number, and the extra is still visible in the payment list. |
| 8 | 🟡 | `waterForm` submit | `if (curr < prev)` does not catch `NaN` (any comparison with `NaN` is false), so a non-numeric reading could be stored as `NaN` and serialise to `null`, poisoning that month's bill permanently. | `isFinite()` guards on both readings, plus non-negative and monotonic checks, before anything is written. |
| 9 | 🟡 | `toast()` | The `#toast` element was declared *after* the `<script>`, so the first call would have thrown if any code path toasted during start-up. It worked only because every toast happened to be triggered later by a click. | The toast element exists before the script runs; `toast()` also null-checks. |
| 10 | 🟡 | Storage | One unversioned key, `rentalManagerV1`, read with `JSON.parse` and used as-is. Any future field (settings, currency) would crash old data, and there was no migration path. | New `rentalManagerV2` document with a `migrate()` step that normalises every record, keeps the old key untouched (rollback-safe), and derives a `since` month for legacy houses so arrears are not invented. |
| 11 | 🟡 | Summary / status text | Status was derived only from `paid` vs `due`; a tenant who moved in mid-month, or a house with zero rent, displayed "UNPAID" for money that was never due. | Rent status considers whether the house existed that month (`since`/`until`); zero-due months show "—" rather than "unpaid". |
| 12 | 🟡 | Theme + inputs | `input { font: inherit }` = 15px, which makes iOS Safari zoom the page on every focus; there were no focus styles at all, so keyboard users could not see where they were. | Inputs are 16px (no iOS zoom), every interactive element has a visible `:focus-visible` ring, and tap targets are at least 44px. |
| 13 | 🟡 | Tables on phones | Seven columns with `white-space: nowrap` forced horizontal scrolling for the most-used screen on a phone. | Houses become stacked cards under 640px (label/value pairs, full-width rows, buttons wrap), while wider screens keep the table. |
| 14 | 🟡 | Month picker | `input[type="month"]` is not supported by Safari (iOS/macOS), where it degrades to a text box that must be typed as `YYYY-MM`. | Feature-detected: unsupported browsers get a populated month `<select>` instead, kept in sync with the same state. |
| 15 | 🟡 | Accessibility | Tabs had no `role`/`aria-selected`, the toast had no live region behaviour on failure, and empty tables had no explanation. | Tabs are a real tablist with `aria-selected`, panels are labelled, toasts stay `aria-live="polite"`, and every empty state explains the next action. |

---

## 2. Data-safety gaps closed

- **No export of any kind.** A cleared browser cache meant the whole portfolio was gone.
  Now: JSON backup/restore, per-month CSV, full payment ledger CSV, history CSV.
- **No way to correct a mistake except deleting the tenant.** Now: edit house, delete a single
  payment, delete/re-save a single reading, and notes on every payment.
- **No record of when a tenant started or left**, which made any "how much is owed from before"
  question unanswerable. Now: `since` / `until` per house, used by arrears and history.

## 3. Added features

- **WhatsApp reminders** (`wa.me` deep links with the exact balance pre-filled), per tenant and
  a "message all" summary to the landlord, plus SMS as a fallback for tenants without WhatsApp.
- **Month-by-month history**: rent due/paid/outstanding, water billed/paid/outstanding, total
  outstanding per month, clickable to jump to that month.
- **Arrears that survive vacating**: unpaid earlier months are listed for every house, including
  tenants who have left.
- **Print statement** (A4, per month, with arrears and payments received) and "Save as PDF" from
  the phone print dialog.
- **Installable offline app**: manifest + service worker + icons; app shell cached, navigation
  network-first with offline fallback.
- **Settings**: currency, country dialling code, clear-by deadline, theme (auto/light/dark),
  landlord phone.
- **Quick actions**: "Mark balance paid", month stepper ‹ ›, duplicate house-number guard,
  vacate/reinstate.

## 4. Preserved behaviour

- Same workflow and same numbers: rent due = monthly rent, water = (current − previous) × rate
  per unit, payments recorded per month, totals per house.
- Your existing data is read automatically on first launch (v1 key → v2 document) — nothing to
  re-enter, and the old key is kept so a rollback is possible.
- The original `localStorage` design is preserved (no server, no account, works offline).

## 5. Structure change

v1 was a single HTML file. For an installable offline app a service worker must be a separate
same-origin file, and caching is far cleaner when CSS/JS are separate. The split is therefore
`index.html` + `styles.css` + `app.js` + `sw.js` + `manifest.webmanifest`. Functionality is
identical; the app still opens from a folder or a USB stick (minus install/offline, which needs
HTTPS or localhost).

## 6. How this was verified

`npm test` runs 124 assertions against the real DOM in jsdom, driving the actual forms and
buttons:

- add/edit/duplicate/delete/vacate houses, select population, sorting;
- partial and full rent payments, "mark balance paid", rejected zero amounts;
- water reading maths, live preview, rejected decreasing reading, re-saving a month, deletion;
- summary totals, KPIs, arrears, history rows and month navigation;
- WhatsApp/SMS number normalisation and message content (currency, deadline, balance);
- CSV shape (BOM, headers, totals, payments section), JSON backup, print document;
- theme cycling, settings persistence, storage writes;
- **migration of a v1 data set**, including its top-level `landlordPhone` / `deadline`, preserved
  reading charges and derived `since` months;
- iOS month-select fallback, duplicate-id and label-association checks, and zero uncaught errors.
