# B2B-B2C-Pharma-Suite

Dashboard for a medical supplies distributor, with a portal where chemists see your stock and place orders. Plain HTML, CSS and JavaScript plus a small Node.js server — no build step and no packages to install.

## Sections

- **Overview** — sales vs purchases, receivables, stock value, alerts (including licences about to expire and new chemist orders)
- **Sales** — bills to chemists and individual customers (stock is deducted earliest-expiry first)
- **Chemist Orders** — orders placed on the chemist portal; turn them into a sale bill, or a purchase order for items that are short
- **Onboard Chemists** — drug licence 1 & 2, GSTIN, licence validity, credit limit, status and portal login
- **Stock Details** — batch-wise stock, near-expiry and expired batches, reorder list
- **Products** — product master with HSN, GST, MRP, PTR and PTS
- **Purchase** — purchase summary, supplier folders and every purchased item
- **Bill Upload / Entry** — read a supplier bill photo/PDF with AI, import a CSV, or type it in
- **Supplier Details** — supplier master with licences and payables
- **Supplier folders** — each supplier's bills (with the uploaded bill copy), item purchase history and item summary
- **Purchase Orders**, **Goods Receipt (GRN)**, **Purchase Invoices**

Lists have filters for company/brand, category, type/form, item, supplier and month. Stock, products and chemists can be ticked to set the same CD%, TD% or GST% on many rows at once; the bill entry grid and the sale bill editor have the same option for their lines.

Drug licences and GST certificates can be read with AI: in the chemist, supplier or Settings (your own firm) form, choose the licence photos/PDFs and click **Read with AI** — the licence numbers, GSTIN, validity, name and address are filled in for you to check. AI reading uses your Anthropic API key, saved in Settings in that browser.

## Run with the server (logins and chemist portal)

Needs Node.js 18 or newer.

```
node server.js
```

Open http://127.0.0.1:8080. The first time, you create the admin login. Then, when onboarding a chemist (or from **Onboard Chemists → View → Portal login**), create a username and password for them. Chemists sign in at the same address and land on their portal, where they can:

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
