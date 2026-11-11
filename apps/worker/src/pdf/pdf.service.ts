import puppeteer, { type Browser } from 'puppeteer';
import crypto from 'node:crypto';
import type { Db } from '@bm/api/config/db';
import { env } from '@bm/api/config/env';
import { storage } from '@bm/api/config/storage/index';
import { renderReceiptHtml, type ReceiptTemplateData } from './receipt.template.js';

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
  async generateAndStoreReceiptPdf(prisma: Db, receiptId: string, browser?: Browser): Promise<string> {
    const receipt = await prisma.receipt.findUniqueOrThrow({
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
    const overpayment = await prisma.creditEntry.findFirst({
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

    const html = renderReceiptHtml(templateData);
    const pdfBuffer = await this.renderHtmlToPdf(html, browser);

    const fileId = crypto.randomUUID();
    const publicId = `basamanager/${env.APP_ENV}/org/${receipt.orgId}/receipts/${fileId}`;
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    await storage.save({
      buffer: pdfBuffer,
      mime: 'application/pdf',
      publicId,
      fileId,
      resourceType: 'raw',
    });

    // Save File record and link receipt to file atomically
    await prisma.$transaction(async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          orgId: receipt.orgId,
          provider: env.STORAGE_DRIVER === 'cloudinary' ? 'cloudinary' : 'local',
          publicId,
          resourceType: 'raw',
          format: 'pdf',
          mime: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          sha256,
          kind: 'receipt_pdf',
          uploadedBy: payment.confirmedBy || payment.submittedBy,
        },
      });

      await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          fileId,
        },
      });
    });

    return fileId;
  }
}

export const pdfService = new PdfService();
