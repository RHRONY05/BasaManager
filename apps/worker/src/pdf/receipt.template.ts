export interface ReceiptTemplateData {
  receiptNumber: string;
  isVoid: boolean;
  orgName: string;
  buildingName: string;
  unitNumber: string;
  tenantName: string;
  tenantEmail?: string | null;
  amountPoisha: number;
  method: string;
  reference?: string | null;
  paidOn: string;
  issuedAt: string;
  allocations: Array<{
    periodMonth: string;
    amountPoisha: number;
  }>;
  creditPoisha?: number;
}

export function formatTaka(poisha: number): string {
  const takaInt = Math.floor(Math.abs(poisha) / 100);
  const poishaRemainder = Math.abs(poisha) % 100;
  const sign = poisha < 0 ? '-' : '';
  const formattedTaka = takaInt.toLocaleString('en-US');
  return `${sign}৳${formattedTaka}.${String(poishaRemainder).padStart(2, '0')}`;
}

export function renderReceiptHtml(data: ReceiptTemplateData): string {
  const formattedTotal = formatTaka(data.amountPoisha);
  const formattedCredit = data.creditPoisha ? formatTaka(data.creditPoisha) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt - ${data.receiptNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 32px;
      font-size: 14px;
      line-height: 1.5;
      position: relative;
    }
    ${
      data.isVoid
        ? `
    .void-watermark {
      position: fixed;
      top: 35%;
      left: 15%;
      transform: rotate(-30deg);
      font-size: 110px;
      font-weight: 900;
      color: rgba(239, 68, 68, 0.18);
      letter-spacing: 12px;
      pointer-events: none;
      z-index: 100;
      border: 8px solid rgba(239, 68, 68, 0.25);
      padding: 10px 40px;
      border-radius: 12px;
    }
    `
        : ''
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #0284c7;
      letter-spacing: -0.5px;
    }
    .org-subtitle {
      font-size: 14px;
      font-weight: 600;
      color: #334155;
      margin-top: 2px;
    }
    .receipt-badge {
      text-align: right;
    }
    .receipt-number {
      font-family: monospace;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .badge {
      display: inline-block;
      margin-top: 4px;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-valid { background: #dcfce7; color: #166534; }
    .badge-void { background: #fee2e2; color: #991b1b; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
    }
    .info-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .info-line {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .info-label { color: #64748b; }
    .info-value { font-weight: 600; color: #0f172a; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      text-align: left;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 14px;
      border-bottom: 1px solid #cbd5e1;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    .text-right { text-align: right; }
    .total-card {
      margin-left: auto;
      width: 260px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 32px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      border-top: 2px solid #cbd5e1;
      padding-top: 8px;
      margin-top: 8px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  ${data.isVoid ? `<div class="void-watermark">VOID</div>` : ''}

  <div class="header">
    <div>
      <div class="brand-title">BasaManager <span style="font-weight: 500; font-size: 18px; color: #64748b;">(বাসা ম্যানেজার)</span></div>
      <div class="org-subtitle">${escapeHtml(data.orgName)}</div>
    </div>
    <div class="receipt-badge">
      <div class="receipt-number">${escapeHtml(data.receiptNumber)}</div>
      <span class="badge ${data.isVoid ? 'badge-void' : 'badge-valid'}">${data.isVoid ? 'VOID' : 'PAID'}</span>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Issued: ${data.issuedAt}</div>
    </div>
  </div>

  <div class="grid">
    <div class="info-box">
      <div class="info-title">Tenant & Unit Details</div>
      <div class="info-line"><span class="info-label">Tenant:</span><span class="info-value">${escapeHtml(data.tenantName)}</span></div>
      ${data.tenantEmail ? `<div class="info-line"><span class="info-label">Email:</span><span class="info-value">${escapeHtml(data.tenantEmail)}</span></div>` : ''}
      <div class="info-line"><span class="info-label">Building:</span><span class="info-value">${escapeHtml(data.buildingName)}</span></div>
      <div class="info-line"><span class="info-label">Unit:</span><span class="info-value">${escapeHtml(data.unitNumber)}</span></div>
    </div>

    <div class="info-box">
      <div class="info-title">Payment Summary</div>
      <div class="info-line"><span class="info-label">Method:</span><span class="info-value" style="text-transform: capitalize;">${escapeHtml(data.method)}</span></div>
      ${data.reference ? `<div class="info-line"><span class="info-label">Reference / TrxID:</span><span class="info-value" style="font-family: monospace;">${escapeHtml(data.reference)}</span></div>` : ''}
      <div class="info-line"><span class="info-label">Paid On:</span><span class="info-value">${escapeHtml(data.paidOn)}</span></div>
      <div class="info-line"><span class="info-label">Amount:</span><span class="info-value" style="color: #0284c7; font-weight: 700;">${formattedTotal}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Period Month</th>
        <th class="text-right">Amount Allocated</th>
      </tr>
    </thead>
    <tbody>
      ${
        data.allocations.length > 0
          ? data.allocations
              .map(
                (a) => `
        <tr>
          <td>Bill Payment Allocation</td>
          <td>${escapeHtml(a.periodMonth)}</td>
          <td class="text-right">${formatTaka(a.amountPoisha)}</td>
        </tr>`,
              )
              .join('')
          : `<tr><td colspan="3" style="text-align: center; color: #64748b;">No direct bill allocations</td></tr>`
      }
      ${
        formattedCredit
          ? `
        <tr>
          <td>Advance / Overpayment Credit</td>
          <td>Available on next bill</td>
          <td class="text-right" style="color: #0284c7;">${formattedCredit}</td>
        </tr>`
          : ''
      }
    </tbody>
  </table>

  <div class="total-card">
    <div class="info-line">
      <span class="info-label">Allocated to Bills:</span>
      <span class="info-value">${formatTaka(data.allocations.reduce((sum, a) => sum + a.amountPoisha, 0))}</span>
    </div>
    ${
      formattedCredit
        ? `<div class="info-line">
      <span class="info-label">Overpayment Credit:</span>
      <span class="info-value">${formattedCredit}</span>
    </div>`
        : ''
    }
    <div class="total-row">
      <span>Total Paid:</span>
      <span>${formattedTotal}</span>
    </div>
  </div>

  <div class="footer">
    This is an authentic, computer-generated receipt issued by BasaManager (বাসা ম্যানেজার).<br>
    No physical signature is required.
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
