import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Home, FileText, ArrowRight } from 'lucide-react';
import { useActiveLease } from '../../lib/api/leases';
import { Skeleton } from '../../components/ui/Skeleton';

export default function HomePage() {
  const { t } = useTranslation();
  const { data: lease, isPending } = useActiveLease();

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">{t('headings.tenantHome')}</p>
        <h1 className="text-2xl font-bold text-fg break-words">{t('headings.tenantHome')}</h1>
      </div>

      {isPending ? (
        <div data-skeleton aria-busy="true" className="space-y-3">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : lease ? (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-accent" />
              <h2 className="font-bold text-base text-fg">
                Unit {lease.unit?.label}
                {lease.unit?.buildingName ? ` · ${lease.unit.buildingName}` : ''}
              </h2>
            </div>
            <span className="badge badge--success capitalize">{lease.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 py-2 border-y border-border/50 text-sm">
            <div>
              <span className="text-xs text-fg-muted">{t('tenantPortal.monthlyRent')}</span>
              <p className="font-bold num text-fg">{formatMoney(lease.monthlyRentPoisha)}</p>
            </div>
            <div>
              <span className="text-xs text-fg-muted">{t('tenantPortal.depositHeld')}</span>
              <p className="font-bold num text-accent">{formatMoney(lease.depositHeldPoisha)}</p>
            </div>
          </div>

          <Link to="/t/lease" className="btn btn--secondary btn--sm w-full">
            <FileText className="h-4 w-4 mr-1.5" />
            {t('tenantPortal.leaseTitle')}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
