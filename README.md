# B2B-B2C-Pharma-Suite

Dashboard for a medical supplies distributor, with a portal where chemists see your stock and place orders. Plain HTML, CSS and JavaScript plus a small Node.js server — no build step. The only server package is Anthropic's official SDK, used by the Chemist Assistant.

## Sections

- **Overview** — sales vs purchases, receivables, stock value, alerts (including licences about to expire and new chemist orders)
- **Sales** — bills to chemists and individual customers (stock is deducted earliest-expiry first)
- **Sales Returns** — pick the chemist or customer, tick the lines supplied to them (from all their bills) and enter how much is coming back; the return starts as a request. Approving puts the stock back into the same batch, credits the bill(s) and gives a printable credit note. Returns can be rejected, edited while requested, or deleted (an approved one is reversed)
- **Enquiries** — who asked for what (chemist, customer or a new person), source, follow-up date and status (Open, Quoted, Converted, Lost); “Make bill” turns an enquiry into a sale bill. Due follow-ups show on the Overview
- **Customers** — walk-in / retail customers with address, bills, purchases and balance; picked or created in the sale bill
- **Party Ledger** — for any chemist, customer or supplier: bills, dated payments and returns with a running balance, opening balance for a date range, a balances summary for all parties, A4 print and CSV export
- **Profile** (click the avatar, top right) — business name, tagline, logo (shown in the sidebar and on bills), your name and designation
- **Agents & Approvals** — five assistants. Nothing is sent or ordered without you: they put items in an Approvals inbox.
  - *Order Desk* (AI): paste an order message; it matches items to your products and stock, then make a bill, save an enquiry or reply with availability
  - *Stock & Purchase*: draft purchase orders per supplier from sales, enquiries and chemist orders; near-expiry and slow-moving stock
  - *Collections*: overdue parties with a ready reminder (WhatsApp / SMS / email, UPI ID or Razorpay link); does not repeat within the set days
  - *Compliance*: expired / expiring drug licence and FSSAI, missing licences, wrong GSTIN check digit; can stop billing to a chemist with an expired licence; GST summary CSV (B2B, B2C, HSN, credit notes) for GSTR-1
  - *Daily Briefing*: yesterday's sales and collections, approvals waiting, follow-ups, stock alerts, demand by district, backup reminder

  - *Purchase Intake*: warns in Bill Upload / Entry when a rate differs from the last purchase, the MRP changed or the GST differs; daily rate-change report, one-click fix for sale rates below cost or above MRP, reminder for unchecked stock lines
  - *Returns & Expiry Claims*: advises approve / check on each sales return request against your policy; drafts expiry claims to suppliers, which become purchase returns (debit notes)
  - *Enquiry Follow-up*: follow-up messages with current availability and rates, “now in stock” messages, old enquiries to mark lost
  - *Accounts Sync*: monthly statements for parties with a balance, bank statement CSV matching to open bills (payments recorded only when you approve), Tally XML of sale vouchers

  - *Marketing*: weekly WhatsApp update for chemists about new stock and your offer, a public post with only non-prescription items, a 1080×1080 image card to download, and optional AI wording
  - *Reviews & Reputation*: asks recent customers for a Google review with your review link, at most once per person in the set days
  - *Chemist Assistant*: a 24×7 “Ask us” chat in the chemist portal (server only). Claude answers about stock, rates, the chemist's own orders and balance, and places an order only after the chemist confirms — it arrives as New in Chemist Orders. It never sees purchase rates or other chemists. Daily limits per chemist and in total; conversations are visible to you under Agents

  Daily agents run the first time the dashboard is open after their set time each day.
- **Purchase Returns** — debit notes for goods sent back to suppliers (expiry claims, damage, wrong item): stock goes out, the supplier's payable and ledger go down, print the debit note, mark it settled when the supplier's credit note arrives
- **Settings** — Business, **Integrations** (AI providers, WhatsApp, voice calls, SMS, online payments, email, Instagram & Facebook, business profiles, geo demand, online classes, sheets & accounting, Google & backups, data & demo mode, GST e-invoice, and custom webhooks — each with on/off, status dot, configuration and a connection test where possible), Agents and Data & backups (backup, restore, start with empty data). Keys and passwords for integrations are stored only on the server (`data/secrets.json`), never in the browser or the backup. Working now without extra setup: messages open in WhatsApp / SMS / email ready to send, UPI ID in reminders, CSV exports. With the server and your keys: WhatsApp Business API sending, Razorpay payment links and custom webhooks. Voice, bulk SMS, SMTP, social posting, Google Business, Tally sync, Drive backup and e-invoice save their settings for later.
- **Chemist Orders** — orders placed on the chemist portal; turn them into a sale bill, or a purchase order for items that are short
- **Onboard Chemists** — drug licence 1 & 2, GSTIN, licence validity, credit limit, status and portal login
- **Stock Details** — batch-wise stock, near-expiry and expired batches, reorder list
- **Products** — product master with HSN, GST, MRP, PTR and PTS
- **Purchase** — purchase summary, supplier folders and every purchased item
- **Bill Upload / Entry** — read a supplier bill photo/PDF with AI, import a CSV, or type it in
- **Supplier Details** — supplier master with licences and payables
- **Supplier folders** — each supplier's bills (with the uploaded bill copy), item purchase history and item summary
- **Purchase Orders**, **Goods Receipt (GRN)**, **Purchase Invoices**
- **Hospital Directory** — medical colleges, AIIMS, the medical university, zonal/regional/civil hospitals, CHCs and PHCs of Himachal Pradesh, filterable by district, tehsil/block and type, with the chemists near each one. The "Nearby hospital" in chemist, supplier and firm forms is a dropdown filtered to the chosen district, with that tehsil's hospitals first.

  Each hospital can also hold the head of hospital's and the pharmacist's name and mobile number.
- **Doctors Directory** — medical officers and doctors with designation, specialization, qualification, mobile and the hospital they work at (picked from the hospital directory, filtered by district and tehsil). Filter by district, specialization, designation and hospital; import/export CSV (name, designation, specialization, qualification, mobile, email, hospital, district, notes). Each hospital page lists its doctors. It starts empty.

  The starting hospital list (`hospitals-data.js`, 541 entries) was taken from the HP State Pollution Control Board's list of health care facilities, with districts and blocks filled from India Post PIN data where the list did not print them. The medical colleges, AIIMS, the medical university and zonal/regional hospitals were added by hand and are marked "please verify". The list may not include every health centre: add missing ones in the app, or import an official list as CSV (name, type, district, tehsil, locality, pincode, phone).

Bills (sale bills, purchase bills and goods receipts) print in **A4**, **A4 landscape**, **A5 (half sheet, landscape)**, **thermal 80 mm** or **thermal 58 mm**: pick the size above the bill preview and press Print. The choice is remembered. A4/A5 bills show the firm's licences, GST summary, amount in words, bank details and terms (set in Settings) and signature lines; thermal receipts are a compact roll layout — in the print window choose the thermal printer and its roll paper size.

Lists have filters for company/brand, category, type/form, item, supplier and month. Stock, products and chemists can be ticked to set the same CD%, TD% or GST% on many rows at once; the bill entry grid and the sale bill editor have the same option for their lines.

Chemists, suppliers and your own firm have drug licence 1 & 2, FSSAI licence number, GSTIN and validity dates, and an address entered district first: district → tehsil → sub-tehsil → village/locality → house/street → PIN, plus the nearby hospital. Suggestions come from the names already used in that district, and lists can be filtered by district and tehsil.

Drug licences, FSSAI licences and GST certificates can be read with AI: in the chemist, supplier or Settings (your own firm) form, choose the photos/PDFs and click **Read with AI** — the licence numbers, GSTIN, validity dates, name and address are filled in for you to check. AI reading uses your Anthropic API key, saved in Settings in that browser.

## Run with the server (logins and chemist portal)

Needs Node.js 18 or newer. The first time (and after updates), install the server package:

```
npm install
node server.js
```

The Chemist Assistant also needs an Anthropic API key saved on the server (Settings → Integrations → AI providers → “Anthropic API key for the server”) and to be switched on under Agents.

Open http://127.0.0.1:8080. The first time, you create the admin login. Then, when onboarding a chemist (or from **Onboard Chemists → View → Portal login**), give them a portal login: by default the **login ID is the chemist's email** and the **password is their mobile number**, filled in as you type (you can change both). Because a mobile number is easy for others to know, the chemist is asked to set their own password at first sign-in, and the portal shows nothing else until they do (you can untick this). Chemists sign in at the same address and land on their portal, where they can:

- see every item with its availability, rate and MRP, and filter by company, category, type and availability
- order any item — also items that are not in stock — and request items that are not in the list
- follow their orders and see their bills and balance

Only Active chemists with a switched-on login can sign in. Passwords are stored hashed (scrypt); repeated wrong passwords lock that username for 10 minutes.

Settings (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` so phones and computers on your shop network can connect |
| `DATA_DIR` | `./data` | Where data, logins and orders are kept — back this folder up |

For chemists outside your network, host the server online (any small VPS or Node host) behind HTTPS, or use a tunnel such as Cloudflare Tunnel. Do not expose it without HTTPS, because passwords would travel unencrypted.

Signing in again is needed after the server restarts.

## Run without the server

Any static file server works too, for example:

```
python -m http.server 5173
```

Data is then saved only in that browser's localStorage, and the login and chemist portal are not available. To move that data to the server: **Settings → Download backup** at the old address, then sign in on the server and use **Settings → Restore backup**. The server otherwise starts with sample data.

Bill copies and licence files are kept in the browser's IndexedDB (on the computer where they were added) and are not part of the JSON backup.
