import puppeteer, { type Browser } from 'puppeteer';
import crypto from 'node:crypto';
import type { Db, TenantCtx } from '@bm/api/config/db';
import { storage } from '@bm/api/config/storage/index';
import { renderReceiptHtml, type ReceiptTemplateData } from './receipt.template.js';

export interface GenerateReceiptPdfOptions {
  browser?: Browser;
  orgId?: string;
  env?: string;
  storageDriver?: string;
  now?: () => Date;
}

export class PdfService {
  /**
   * Renders HTML content into an A4 PDF Buffer using headless Chrome.
   */
  async renderHtmlToPdf(html: string, externalBrowser?: Browser): Promise<Buffer> {
    const browser =
      externalBrowser ??
      (await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      }));

    try {
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        const pdfUint8Array = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
        });
        return Buffer.from(pdfUint8Array);
      } finally {
        await page.close();
      }
    } finally {
      if (!externalBrowser) {
        await browser.close();
      }
    }
  }

  /**
   * Generates a receipt PDF for a given receipt ID and attaches the resulting File record.
   */
  async generateAndStoreReceiptPdf(
    prisma: Db,
    receiptId: string,
    optionsOrBrowser?: Browser | GenerateReceiptPdfOptions,
  ): Promise<string | null> {
    const options: GenerateReceiptPdfOptions =
      optionsOrBrowser && 'newPage' in optionsOrBrowser
        ? { browser: optionsOrBrowser }
        : ((optionsOrBrowser as GenerateReceiptPdfOptions) ?? {});

    const browser = options.browser;
    const workerUserId = '00000000-0000-4000-8000-000000000000';

    let targetOrgId = options.orgId;
    if (!targetOrgId) {
      const meta = await prisma.$tx({ orgId: null, userId: workerUserId, role: null }, async (tx) => {
        return tx.receipt.findUniqueOrThrow({
          where: { id: receiptId },
          select: { orgId: true },
        });
      });
      targetOrgId = meta.orgId;
    }

    const workerOrgCtx: TenantCtx = {
      orgId: targetOrgId,
      userId: workerUserId,
      role: null,
    };

    const { receipt, templateData } = await prisma.$tx(workerOrgCtx, async (tx) => {
      const receipt = await tx.receipt.findUniqueOrThrow({
        where: { id: receiptId },
        include: {
          payment: {
            include: {
              lease: {
                include: {
                  unit: {
                    include: {
                      building: true,
                    },
                  },
                  tenants: {
                    include: {
                      membership: {
                        include: {
                          user: true,
                        },
                      },
                    },
                  },
                },
              },
              allocations: {
                include: {
                  bill: true,
                },
              },
            },
          },
          org: true,
        },
      });

      const payment = receipt.payment;
      const primaryTenant = payment.lease.tenants[0]?.membership?.user;
      const overpayment = await tx.creditEntry.findFirst({
        where: {
          paymentId: payment.id,
          kind: 'overpayment',
        },
      });

      const templateData: ReceiptTemplateData = {
        receiptNumber: receipt.number,
        isVoid: receipt.status === 'void',
        orgName: receipt.org.name,
        buildingName: payment.lease.unit.building.name,
        unitNumber: payment.lease.unit.label,
        tenantName: primaryTenant?.fullName || 'Tenant',
        tenantEmail: primaryTenant?.email,
        amountPoisha: Number(payment.amountPoisha),
        method: payment.method,
        reference: payment.reference,
        paidOn: payment.paidOn.toISOString().split('T')[0]!,
        issuedAt: receipt.createdAt.toISOString().split('T')[0]!,
        allocations: payment.allocations.map((a) => ({
          periodMonth: a.bill.periodMonth.toISOString().split('T')[0]!,
          amountPoisha: Number(a.amountPoisha),
        })),
        creditPoisha: overpayment ? Number(overpayment.amountPoisha) : undefined,
      };

      return { receipt, templateData };
    });

    const html = renderReceiptHtml(templateData);
    const pdfBuffer = await this.renderHtmlToPdf(html, browser);

    const fileId = crypto.randomUUID();
    const appEnv = options.env || process.env.APP_ENV || 'test';
    const publicId = `basamanager/${appEnv}/org/${receipt.orgId}/receipts/${fileId}`;
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    await storage.save({
      buffer: pdfBuffer,
      mime: 'application/pdf',
      publicId,
      fileId,
      resourceType: 'raw',
    });

    const now = options.now ? options.now() : new Date();

    // Save File record and link receipt to file atomically, ensuring status hasn't changed
    let attached = false;
    await prisma.$tx(workerOrgCtx, async (tx) => {
      const file = await tx.file.create({
        data: {
          id: fileId,
          orgId: receipt.orgId,
          provider:
            (options.storageDriver || process.env.STORAGE_DRIVER) === 'cloudinary' ? 'cloudinary' : 'local',
          publicId,
          resourceType: 'raw',
          format: 'pdf',
          mime: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          sha256,
          kind: 'receipt_pdf',
          uploadedBy: receipt.payment.confirmedBy || receipt.payment.submittedBy,
        },
      });

      const updated = await tx.receipt.updateMany({
        where: {
          id: receipt.id,
          fileId: null,
          status: receipt.status,
        },
        data: {
          fileId,
        },
      });

      if (updated.count === 0) {
        // Receipt was voided or already attached during render. Soft delete the file record.
        await tx.file.update({
          where: { id: file.id },
          data: {
            deletedAt: now,
          },
        });
      } else {
        attached = true;
      }
    });

    return attached ? fileId : null;
  }
}

export const pdfService = new PdfService();
