# PDF generation

> **Written in task V9.** Covers generating pixel-perfect rent receipts and financial statements using Puppeteer in the background worker, A4 print layout, conditional VOID watermarking, and secure signed downloads.

## What problem it solves

Tenants and landlords require official, legally verifiable documentation for transactions:

- **Rent receipts** for income tax declarations, employer house rent allowances, and proof of timely payment.
- **Monthly statements & annual summaries** for landlord tax audits and property accounting.

Generating PDFs presents several architectural challenges:

1. **CPU & Memory Overhead:** Headless Chrome instances (Puppeteer/Chromium) consume significant RAM (50–150 MB per render) and heavy CPU spikes. Running Chromium inside the main Express API process would block the single-threaded event loop, degrade API response latency, and risk Out-Of-Memory (OOM) crashes under concurrent user traffic.
2. **Layout Consistency:** Server-rendered PDFs using primitive canvas or raw text libraries (like PDFKit) often suffer from broken Bengali text rendering, inflexible tables, and brittle styling.
3. **Audit Trail & Immutability:** When a payment is voided, receipts must reflect this status clearly (e.g., prominent "VOID" watermark) without altering historical receipt sequences or numbers.

**Solution:** BasaManager renders PDFs using **Puppeteer in the background worker (`apps/worker`)** using standard HTML5/CSS print templates. The resulting PDF buffer is saved via the storage driver, linked to the `receipts` record, and served through expiring signed download URLs.

---

## How it works here

### 1. Separation of Concerns: Worker vs API

PDF generation is strictly asynchronous or backgrounded away from the main HTTP API request loop:

- When a payment is confirmed or directly recorded, the API assigns a sequential receipt number (e.g. `BM-2026-000001`) and creates the `receipts` record.
- The worker's `PdfService` (`apps/worker/src/pdf/pdf.service.ts`) executes Puppeteer to generate the PDF buffer.
- In test and local environments, `PdfService` can be invoked to render the PDF synchronously on demand, or through outbox background jobs in production.

### 2. A4 Print Template (`receipt.template.ts`)

The PDF layout is defined as clean, responsive HTML and CSS with print-specific media styles:

- **Standard A4 Page Rules**: `@page { size: A4 portrait; margin: 15mm; }`
- **Typography & Details**: Displays organisation header, landlord contact, receipt number, issue date, tenant details (name, phone, unit number), breakdown of allocated bills and line items, payment method, transaction reference, and total amount in BDT (৳).
- **Conditional VOID Watermark**: If `payment.status === 'voided'`, the template injects a semi-transparent red diagonal watermark spanning the center of the page (`transform: rotate(-45deg); font-size: 72pt; color: rgba(220, 38, 38, 0.2);`).

### 3. Puppeteer Headless Rendering

`PdfService.renderReceiptPdf(data)` controls the headless Chrome lifecycle:

```typescript
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  });
  return Buffer.from(pdfBuffer);
} finally {
  await browser.close();
}
```

Key flags explained:

- `--no-sandbox` & `--disable-setuid-sandbox`: Required for running Chromium inside Linux container environments (Docker, Alpine, Ubuntu) without root escalation privileges.
- `--disable-dev-shm-usage`: Uses `/tmp` instead of `/dev/shm` to avoid shared memory crashes in memory-constrained Docker containers.
- `printBackground: true`: Ensures background colors, badge styling, and table borders are printed faithfully.

### 4. Storage & Retrieval Pipeline

1. The rendered PDF buffer is passed to `StorageDriver.save(...)` with `kind: 'receipt_pdf'`.
2. A row is added to the `files` table, and the `receipt.file_id` foreign key is updated.
3. When a tenant or landlord clicks "Download Receipt" in the web UI, `GET /receipts/:id/download` checks permissions and returns a 5-minute signed URL redirecting to the storage driver.

---

## Diagram

```mermaid
flowchart TD
  subgraph API["Express API (apps/api)"]
    P["POST /payments/:id/confirm<br/>or POST /payments"] --> TX["db.$tx: Insert Receipt<br/>(Sequential receipt_counters)"]
    TX --> O["Write outbox message<br/>(kind: receipt_created)"]
  end

  subgraph Worker["Background Worker (apps/worker)"]
    O -.->|Worker Polling / Job| W["PdfService.generateAndStoreReceiptPdf"]
    W --> TPL["Compile HTML Template<br/>(receipt.template.ts)"]
    TPL --> PUP["Launch Puppeteer Headless<br/>page.pdf({ format: 'A4' })"]
    PUP --> STR["Save via StorageDriver<br/>(Local or Cloudinary)"]
    STR --> DB["Update receipts.file_id<br/>Insert into files table"]
  end

  subgraph Client["Web Browser (apps/web)"]
    UI["Click 'Download Receipt'"] --> DL["GET /receipts/:id/download"]
    DL --> RLS["Verify Session & RLS"]
    RLS --> SIGN["Generate 5-min Signed URL"]
    SIGN --> BROWSER_DL["Browser Downloads PDF"]
  end

  classDef ours fill:#BFE3FD,stroke:none,color:#1f1f1f
  classDef worker fill:#FFF1B8,stroke:none,color:#1f1f1f
  classDef ok fill:#C9F2D6,stroke:none,color:#1f1f1f
  class P,TX,O,DL,RLS,SIGN ours
  W,TPL,PUP,STR,DB worker
  UI,BROWSER_DL ok
```

---

## Gotchas

- **Resource Leakage (Zombie Chromium Processes):** If an unhandled exception occurs before `browser.close()`, zombie Chrome processes remain in memory, consuming RAM and eventually causing server OOM. The browser launch and closure must **always** be wrapped in a `try ... finally` block.
- **Linux Docker Dependencies:** Headless Chromium requires underlying OS libraries (e.g. `libnss3`, `libatk-bridge2.0-0`, `libxss1`, `libasound2`). The application Dockerfile includes these standard dependencies for production deployment.
- **Font Availability:** If custom fonts fail to load or are blocked by network policies, Chromium falls back to system fonts, shifting text bounding boxes. Templates must specify standard web-safe fallback stacks (`system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`).
- **Voided Receipt Reproducibility:** When a payment is voided, the original PDF file record is soft-deleted and `receipts.file_id` is set to null with status `void`. The worker's `renderReceiptsJob` re-renders the receipt with a prominent diagonal VOID watermark. Because voiding deletes the original allocations and overpayment entries, the void receipt preserves payment header details with a VOID watermark, maintaining full financial auditability without serving an un-voided receipt.

---

## Where in code

- PDF Service & Templates:
  - `apps/worker/src/pdf/pdf.service.ts` — Puppeteer lifecycle, rendering, and storage upload
  - `apps/worker/src/pdf/receipt.template.ts` — HTML/CSS receipt layout and VOID watermark logic
- Storage configuration: `apps/api/src/config/storage/`
- Receipt download route & controller:
  - `apps/api/src/modules/payments/payments.routes.ts` (`GET /receipts/:id/download`)
  - `apps/api/src/modules/payments/payments.controller.ts` (`downloadReceipt`)
  - `apps/api/src/modules/payments/payments.service.ts` (`getReceiptDownloadUrl`)
- Frontend receipt integration:
  - `apps/web/src/pages/tenant/TenantBillDetailPage.tsx` (receipt download action)
  - `apps/web/src/pages/landlord/PaymentsPage.tsx` (receipt download button in history table)

---

## Self-check

1. Why is PDF generation delegated to the background worker rather than executed synchronously in the Express API request loop?
   <details><summary>Answer</summary>Headless Chromium instances require significant memory (50-150 MB) and CPU time. Running Puppeteer inside the single-threaded Node.js API process would block the event loop, degrade response times for all users, and risk OOM crashes under high traffic.</details>

2. How is a receipt visually identified as cancelled if the underlying payment was voided?
   <details><summary>Answer</summary>The HTML template checks <code>payment.status === 'voided'</code> and injects a prominent, rotated semi-transparent red "VOID" watermark across the center of the A4 page.</details>

3. What crucial safeguard prevents zombie Puppeteer processes from exhausting container memory during unexpected errors?
   <details><summary>Answer</summary>Every Puppeteer operation is wrapped in a <code>try ... finally</code> block ensuring that <code>await browser.close()</code> executes unconditionally, even if page navigation or PDF rendering throws an error.</details>

4. Which Chrome flags are mandatory when running Puppeteer inside Linux container environments (Docker)?
   <details><summary>Answer</summary><code>--no-sandbox</code> and <code>--disable-setuid-sandbox</code> (to operate without root sandbox privileges) along with <code>--disable-dev-shm-usage</code> (to prevent crashes due to limited shared memory in <code>/dev/shm</code>).</details>

5. How does a tenant download their generated receipt from the browser?
   <details><summary>Answer</summary>The tenant hits <code>GET /receipts/:id/download</code>. The API checks the tenant's authentication and tenancy ownership, then retrieves an expiring signed URL from the storage driver (Local or Cloudinary) and redirects or returns the URL to the browser.</details>
