import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { FileText, Calendar, ArrowRight } from 'lucide-react';
import { useBills } from '../../lib/api/billing.js';
import { formatMoney } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';

export default function BillsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: bills = [], isPending, isError, error, refetch } = useBills();

  // Tenant only sees issued, partially_paid, paid bills
  const issuedBills = bills.filter((b) => b.status !== 'draft');

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-fg break-words">{t('headings.tenantBills')}</h1>
        <p className="text-xs text-fg-muted">
          {t('tenantPortal.billsSubtitle', 'View monthly bills, payments and breakdown')}
        </p>
      </div>

      {isPending ? (
        <div data-skeleton aria-busy="true" className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={() => void refetch()} />
      ) : issuedBills.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <FileText className="h-8 w-8 text-fg-muted mx-auto" />
          <p className="font-semibold text-fg">{t('billing.emptyIssued')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {issuedBills.map((bill) => (
            <div
              key={bill.id}
              className="card p-4 flex items-center justify-between gap-3 hover:border-accent/40 transition-colors cursor-pointer"
              onClick={() => navigate(`/t/bills/${bill.id}`)}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-fg">{bill.periodMonth.slice(0, 7)}</span>
                  <span
                    className={`badge text-xs capitalize ${
                      bill.status === 'paid'
                        ? 'badge--success'
                        : bill.status === 'partially_paid'
                          ? 'badge--warning'
                          : 'badge--neutral'
                    }`}
                  >
                    {t(`billing.status.${bill.status}`)}
                  </span>
                  {bill.overdue && (
                    <span className="badge badge--danger text-xs">{t('billing.status.overdue')}</span>
                  )}
                </div>
                <p className="text-xs text-fg-muted flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {t('billing.dueDate')}: {bill.dueDate}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold num text-base text-fg">
                    {formatMoney(bill.balancePoisha > 0 ? bill.balancePoisha : bill.totalPoisha)}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {bill.balancePoisha > 0 ? t('billing.balance') : t('billing.total')}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-fg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
