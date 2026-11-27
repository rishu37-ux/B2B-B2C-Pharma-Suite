# B2B-B2C-Pharma-Suite

Dashboard for a medical supplies distributor. Plain HTML, CSS and JavaScript — no build step.

## Sections

- **Overview** — sales vs purchases, receivables, stock value, alerts
- **Sales** — invoices to chemists, payment collection (stock is deducted earliest-expiry first)
- **Onboard Chemists** — drug licence, GSTIN, credit limit, verification status
- **Stock Details** — batch-wise stock, near-expiry and expired batches, reorder list
- **Products** — product master with HSN, GST, MRP, PTR and PTS
- **Purchase** — purchase summary across suppliers
- **Supplier Details** — supplier master and payables
- **Purchase Orders** — create, receive and cancel POs
- **Goods Receipt (GRN)** — receive goods against a PO and add batches to stock
- **Purchase Invoices** — supplier bills, due dates and payments

## Run

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 5173
```

Then visit http://127.0.0.1:5173.

Data is saved in the browser's localStorage and starts with sample data. Use **Reset sample data** in the sidebar to start over.
