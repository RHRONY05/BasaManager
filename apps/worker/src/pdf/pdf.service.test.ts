import { describe, it, expect, vi } from 'vitest';
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

  it('aborts attaching and soft deletes generated file if receipt status changes during render', async () => {
    const service = new PdfService();
    let softDeletedFileId: string | null = null;

    const receipt = {
      id: 'receipt-1',
      orgId: 'org-1',
      status: 'valid',
      number: 'BM-2026-000001',
      fileId: null,
      createdAt: new Date(),
      payment: {
        id: 'pay-1',
        orgId: 'org-1',
        leaseId: 'lease-1',
        amountPoisha: 100000n,
        method: 'cash',
        status: 'confirmed',
        reference: null,
        paidOn: new Date(),
        confirmedBy: 'user-1',
        submittedBy: 'user-1',
        allocations: [],
        lease: {
          tenants: [{ membership: { user: { fullName: 'Tenant A', email: 'tenant@example.com' } } }],
          unit: { label: '1A', building: { name: 'Building 1' } },
        },
      },
      org: { name: 'Org 1' },
    };

    const mockTx = {
      receipt: {
        findUniqueOrThrow: async () => receipt,
        updateMany: async () => ({ count: 0 }), // 0 updated because status changed/already has file
      },
      creditEntry: {
        findFirst: async () => null,
      },
      file: {
        create: async (args: { data: { id: string } }) => ({ id: args.data.id }),
        update: async (args: { where: { id: string } }) => {
          softDeletedFileId = args.where.id;
          return { id: args.where.id };
        },
      },
    };

    const mockPrisma = {
      $tx: async (_ctx: unknown, cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    };

    // Spy renderHtmlToPdf to avoid invoking Puppeteer in this test
    vi.spyOn(service, 'renderHtmlToPdf').mockResolvedValue(Buffer.from('%PDF-1.4 test'));

    const result = await service.generateAndStoreReceiptPdf(
      mockPrisma as unknown as Parameters<typeof service.generateAndStoreReceiptPdf>[0],
      'receipt-1',
    );
    expect(result).toBeNull();
    expect(softDeletedFileId).toBeTruthy();
  });
});
