# B2B-B2C-Pharma-Suite

Dashboard for a medical supplies distributor, with a portal where chemists see your stock and place orders. Plain HTML, CSS and JavaScript plus a small Node.js server — no build step. The only server package is Anthropic's official SDK, used by the Chemist Assistant.

## Sections

- **Overview** — sales vs purchases, receivables, stock value, alerts (including licences about to expire and new chemist orders)
- **Sales** — bills to chemists and individual customers (stock is deducted earliest-expiry first)
- **Sales Returns** — pick the chemist or customer, tick the lines supplied to them (from all their bills) and enter how much is coming back; the return starts as a request. Approving puts the stock back into the same batch, credits the bill(s) and gives a printable credit note. Returns can be rejected, edited while requested, or deleted (an approved one is reversed)
- **Enquiries** — who asked for what (chemist, customer or a new person), source, follow-up date and status (Open, Quoted, Converted, Lost); “Make bill” turns an enquiry into a sale bill. Due follow-ups show on the Overview
- **Sales Team** — salesmen and MRs with their areas, monthly targets, sales, collections, overdue in their area and commission
- **Customers** — walk-in / retail customers with address, bills, purchases and balance; picked or created in the sale bill
- **Party Ledger** — for any chemist, customer or supplier: bills, dated payments and returns with a running balance, opening balance for a date range, a balances summary for all parties, A4 print and CSV export
- **GST / ITC Match** — your purchase bills against the GSTR-2B months you imported: Not in 2B, Mismatch, Not in books, Matched; hold or release a supplier's payment
- **Profile** (click the avatar, top right) — business name, tagline, logo (shown in the sidebar and on bills), your name and designation
- **Agents & Approvals** — thirty-three assistants. Nothing is sent or ordered without you: they put items in an Approvals inbox.
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

  - *Recall & NSQ Watch*: add the monthly CDSCO Not-of-Standard-Quality / spurious drug alert, a banned FDC list or a company recall (paste it, or read the PDF with AI). Batches are matched by batch number (and banned combinations by the product's salt); for each match you see your stock and every party it was sold to — block the batch for billing (it also disappears from the chemist portal), WhatsApp the chemists, and make a purchase return. Reminds you to add the list each month
  - *Price Ceiling (NPPA)*: products get a schedule and an NPPA ceiling price per pack; stock whose MRP is above the ceiling + GST is flagged (also while entering a supplier bill). NPPA notifications can be read with AI and matched to your products, or typed in
  - *Schedule H1 / NDPS Register*: printable / CSV sale register of Schedule H1, X and NDPS drugs by month; warns about these drugs sold to chemists without a valid licence or to customers without prescription details (the sale bill has a “Prescription” field), and about unusual quantities to one chemist
  - *Chemist Credit Risk*: A–D score for every chemist (payment speed against terms, overdue, limit use, oldest bill), shown in the chemist list and the sale bill; suggests raising or lowering limits, asks before a bill takes a chemist over the limit, and lists chemists buying less than usual with a win-back message
  - *Schemes & Claims*: a Schemes page for company schemes (buy X get Y free, extra discount, or a claim per unit / % on your sales); warns before a scheme ends, checks purchase bills for the free goods or discount, and prepares a printable claim statement — mark claims received
  - *Route & Delivery*: set routes per weekday (“Monday: Ghumarwin, Jhandutta”); each morning a dispatch / loading sheet of bills not yet delivered on today's route, a “delivery today” WhatsApp per chemist, tick delivered, and late deliveries
  - *Hospital & Doctor Outreach*: weekly doctor visit plan from the Doctors Directory (specialities that fit your new products, or routine visits), with a printable plan and visit log, and hospitals in your districts with none of your chemists nearby

  - *GSTR-2B Reconciliation*: import the GSTR-2B JSON from the GST portal (or the Excel's B2B sheet saved as CSV); every purchase bill is matched by supplier GSTIN and invoice number (or amount and date). Shows bills your suppliers have not filed (input tax credit at risk — hold their payment until they do; the hold lifts itself), amount differences, and 2B invoices missing from your books. Reminds you on the 14th
  - *Payment Planner*: week-by-week cash plan — money expected from chemists (by their terms or usual payment days; overdue counted at a set %) against supplier bills due, from your cash and bank balance; this week's supplier payments, and a warning before a week where money may run short. Suppliers on GSTR-2B hold are left out
  - *e-Invoice & e-Way Bill*: bills above the e-way bill limit (and, if your turnover needs it, B2B bills without an IRN) — downloads the JSON for bulk upload on the e-way bill / e-invoice portals (try one bill first) and saves the numbers you get back; they print on the bill
  - *Near-Expiry Clearance*: stock expiring in the next months, offered at a step-up discount (10 / 15 / 20 %) to the chemists who buy those items, with a WhatsApp offer each
  - *Cold Chain Watch*: products marked “Cold chain (2–8 °C)”, a fridge temperature log (morning and evening), alerts for missed or out-of-range readings, suggestions for products that may need cold storage, and a ❄ note on the dispatch list
  - *Supplier Performance*: A–D score per supplier (fill rate, days late, short shelf-life stock, costlier rates); items cheaper from another supplier; optionally draft purchase orders to the cheapest supplier
  - *Audit & Anomaly*: big discounts, sales below cost, sale bills deleted or changed later (every edit and delete is now recorded), stock below zero, repeated payments, duplicate records and wrong HSN / GST

  - *Substitute Finder*: when an item in an enquiry or chemist order is short, finds products with the same salt and strength in the same form that are in stock (salt written in any order or spacing), with a ready message; also shown in Order Desk, chemist orders, a “Find substitute” tool and the chemist portal. For patients, a brand change needs the doctor's consent
  - *Profit & Margin*: weekly profit and margin against the weeks before, low-margin chemists and products, dead stock at cost; monthly report by company, product and party
  - *Refill Reminder*: walk-in customers on long-term medicines (diabetes, BP, thyroid, heart… — set per product or found from the name / salt) get a WhatsApp reminder a few days before the medicine runs out
  - *Chemist Smart Reorder*: learns each chemist's usual items, quantities and how often they order; when due, the list can be sent on WhatsApp or turned into a bill. Chemists see “Your usual order” in the portal
  - *Seasonal Forecast*: one month ahead — last year's sales of that month, or the season (monsoon, winter, summer) for related medicines — against stock and open purchase orders; drafts purchase orders
  - *Sales Team & Targets*: a Sales Team page with salesmen / MRs, their areas or chemists, monthly target, collections and commission; each morning a plan for each of them (dues, usual orders due, chemists not ordering) to send on WhatsApp
  - *WhatsApp Order Inbox*: messages to your WhatsApp Business number arrive in an inbox (server webhook `/api/hooks/whatsapp`, checked with your verify token and app secret); “Read order” opens Order Desk with the message — read with AI, or without AI by matching product names and quantities. Needs the server reachable over HTTPS and the WhatsApp Business API

  Order Desk can now also read a message without AI (“Read without AI”), matching names like “Dolo 650 - 10 strip”.

  Daily agents run the first time the dashboard is open after their set time each day.
- **Recalls & NSQ** — the drug alert lists you added, how many entries match your stock or sales, and the blocked batches (unblock from here or from Stock Details → Blocked)
- **Schemes & Claims** — company schemes with their status, and the claims made and received
- **Purchase Returns** — debit notes for goods sent back to suppliers (expiry claims, damage, wrong item): stock goes out, the supplier's payable and ledger go down, print the debit note, mark it settled when the supplier's credit note arrives
- **Settings** — Business, **Integrations** (AI providers, WhatsApp, voice calls, SMS, online payments, email, Instagram & Facebook, business profiles, geo demand, online classes, sheets & accounting, Google & backups, data & demo mode, GST e-invoice, and custom webhooks — each with on/off, status dot, configuration and a connection test where possible), Agents and Data & backups (backup, restore, start with empty data). Keys and passwords for integrations are stored only on the server (`data/secrets.json`), never in the browser or the backup. Working now without extra setup: messages open in WhatsApp / SMS / email ready to send, UPI ID in reminders, CSV exports. With the server and your keys: WhatsApp Business API sending, Razorpay payment links and custom webhooks. Voice, bulk SMS, SMTP, social posting, Google Business, Tally sync, Drive backup and e-invoice save their settings for later.
- **Chemist Orders** — orders placed on the chemist portal; turn them into a sale bill, or a purchase order for items that are short
- **Onboard Chemists** — drug licence 1 & 2, GSTIN, licence validity, credit limit, status and portal login
- **Stock Details** — batch-wise stock, near-expiry and expired batches, reorder list
- **Products** — product master with HSN, GST, MRP, PTR and PTS
- **Purchase** — purchase summary, supplier folders and every purchased item
- **Bill Upload / Entry** — read a supplier bill photo/PDF for free (no key), read it with AI, import a CSV, or type it in.
  - *Read bill (free)* runs in the browser: PDFs made by billing software are read exactly from their text (PDF.js); photos and scanned PDFs are read with OCR (Tesseract — about 15 MB downloaded the first time, then cached). The item table is read under its printed headers (Item, Pack, HSN, Batch, Exp, Qty, Free, MRP, Rate, Disc, GST, Amount); bills without headers are read row by row (expiry, the batch before it, and qty × rate = amount). Names of products you already have are used when the row contains them.
  - The supplier is found from the GSTIN printed on the bill (OCR mix-ups of one or two characters are allowed) or its name, together with the bill number, date and grand total. Saving files the bill in that supplier's folder.
  - Tick “Add to stock by itself…” to skip the review when the supplier is recognised, every line passes the checks and the lines add up to the printed total; otherwise the lines wait in the check grid. OCR on photos can misread numbers — the total check, line checks and Purchase Intake rate warnings catch most of it; check the lines before adding them.
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
