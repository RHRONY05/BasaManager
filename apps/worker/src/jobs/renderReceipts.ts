import puppeteer from 'puppeteer';
import type { Job, JobContext } from './index.js';
import { pdfService } from '../pdf/pdf.service.js';
import { withJobLock } from '../lib/jobLock.js';

export const renderReceiptsJob: Job = {
  name: 'renderReceipts',
  schedule: '* * * * *', // every minute
  ttlMs: 50_000,
  run: async (ctx: JobContext) => {
    await withJobLock(ctx.redis, renderReceiptsJob.name, renderReceiptsJob.ttlMs, async () => {
      const { prisma, logger } = ctx;

      // Find pending receipts that have no PDF file attached
      const pendingReceipts = await prisma.receipt.findMany({
        where: {
          fileId: null,
        },
        select: {
          id: true,
          number: true,
          orgId: true,
        },
        take: 20,
      });

      if (pendingReceipts.length === 0) return;

      logger.info({ count: pendingReceipts.length }, 'Rendering pending receipt PDFs');

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      try {
        for (const receipt of pendingReceipts) {
          try {
            const fileId = await pdfService.generateAndStoreReceiptPdf(prisma, receipt.id, browser);
            logger.info(
              { receiptId: receipt.id, receiptNumber: receipt.number, fileId },
              'Rendered receipt PDF',
            );
          } catch (err) {
            logger.error({ receiptId: receipt.id, err }, 'Failed to render receipt PDF');
          }
        }
      } finally {
        await browser.close();
      }
    });
  },
};
