import { describe, it, expect } from 'vitest';
import { renderReceiptHtml, formatTaka } from './receipt.template.js';
import { PdfService } from './pdf.service.js';

describe('Receipt Template & PDF Service', () => {
  it('formats poisha to taka without float inaccuracy', () => {
    expect(formatTaka(1500000)).toBe('৳15,000.00');
    expect(formatTaka(50)).toBe('৳0.50');
    expect(formatTaka(0)).toBe('৳0.00');
    expect(formatTaka(-250000)).toBe('-৳2,500.00');
  });

  it('renders valid receipt HTML with tenant, building, unit and allocations', () => {
    const html = renderReceiptHtml({
      receiptNumber: 'BM-2026-000001',
      isVoid: false,
      orgName: 'Green View Properties',
      buildingName: 'Green Tower',
      unitNumber: '4A',
      tenantName: 'John Doe',
      tenantEmail: 'john@example.com',
      amountPoisha: 2000000,
      method: 'bkash',
      reference: 'BKASH-TRX-123',
      paidOn: '2026-11-11',
      issuedAt: '2026-11-11',
      allocations: [
        {
          periodMonth: '2026-11-01',
          amountPoisha: 2000000,
        },
      ],
    });

    expect(html).toContain('BM-2026-000001');
    expect(html).toContain('Green View Properties');
    expect(html).toContain('Green Tower');
    expect(html).toContain('4A');
    expect(html).toContain('John Doe');
    expect(html).toContain('BKASH-TRX-123');
    expect(html).toContain('৳20,000.00');
    expect(html).not.toContain('class="void-watermark"');
  });

  it('renders VOID watermark when isVoid is true', () => {
    const html = renderReceiptHtml({
      receiptNumber: 'BM-2026-000001',
      isVoid: true,
      orgName: 'Green View Properties',
      buildingName: 'Green Tower',
      unitNumber: '4A',
      tenantName: 'John Doe',
      amountPoisha: 2000000,
      method: 'cash',
      paidOn: '2026-11-11',
      issuedAt: '2026-11-11',
      allocations: [],
    });

    expect(html).toContain('class="void-watermark"');
    expect(html).toContain('VOID');
  });

  it('renders HTML to valid PDF Buffer using headless Chrome', async () => {
    const service = new PdfService();
    const html = '<html><body><h1>BasaManager Test Receipt</h1></body></html>';
    const pdfBuf = await service.renderHtmlToPdf(html);

    expect(pdfBuf).toBeInstanceOf(Buffer);
    expect(pdfBuf.length).toBeGreaterThan(100);
    // PDF magic bytes %PDF
    expect(pdfBuf.toString('ascii', 0, 4)).toBe('%PDF');
  }, 20000);
});
