import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Plus, MapPin, ChevronRight, Home, DoorOpen } from 'lucide-react';
import { useBuildings } from '../../lib/api/buildings';
import { AddBuildingDialog } from './AddBuildingDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';

export default function BuildingsPage() {
  const { t } = useTranslation();
  const { data: buildings, isPending, isError, error, refetch } = useBuildings();
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg break-words">{t('headings.buildings')}</h1>
          <p className="text-sm text-fg-muted">Manage your properties, units, and billing rules.</p>
        </div>
        <button type="button" onClick={() => setIsAddOpen(true)} className="btn btn--primary">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('buildings.addBuilding')}
        </button>
      </div>

      {isError ? (
        <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div data-skeleton aria-busy="true" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : !buildings || buildings.length === 0 ? (
        <EmptyState
          title={t('buildings.emptyTitle')}
          description={t('buildings.emptyDesc')}
          action={
            <button type="button" onClick={() => setIsAddOpen(true)} className="btn btn--primary btn--sm">
              <Plus className="h-4 w-4 mr-1.5" />
              {t('buildings.addBuilding')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {buildings.map((b) => (
            <Link
              key={b.id}
              to={`/l/buildings/${b.id}`}
              className="card p-5 hover:border-accent transition-colors group block no-underline"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-lg font-bold text-fg group-hover:text-accent transition-colors truncate">
                    {b.name}
                  </h2>
                  <p className="text-xs text-fg-muted flex items-center gap-1 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {b.address}
                      {b.area ? `, ${b.area}` : ''}
                      {b.city ? `, ${b.city}` : ''}
                    </span>
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-fg-muted group-hover:text-accent shrink-0 transition-colors" />
              </div>

              <div className="divider my-3" />

              <div className="grid grid-cols-3 gap-2 text-center py-1 bg-muted/40 rounded-md">
                <div>
                  <span className="text-xs text-fg-muted block">{t('buildings.unitsCount')}</span>
                  <span className="text-base font-bold text-fg">{b.unitCount ?? 0}</span>
                </div>
                <div>
                  <span className="text-xs text-fg-muted block">{t('buildings.occupied')}</span>
                  <span className="text-base font-bold text-fg flex items-center justify-center gap-1">
                    <Home className="h-3 w-3 text-accent" aria-hidden="true" />
                    {b.occupiedCount ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-fg-muted block">{t('buildings.vacant')}</span>
                  <span className="text-base font-bold text-fg flex items-center justify-center gap-1">
                    <DoorOpen className="h-3 w-3 text-fg-muted" aria-hidden="true" />
                    {Math.max(0, (b.unitCount ?? 0) - (b.occupiedCount ?? 0))}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-fg-muted pt-2">
                <span>
                  Bill day: <strong>{b.billDay}th</strong> · Due: <strong>{b.dueDay}th</strong>
                </span>
                <span className="capitalize">{b.city}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AddBuildingDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
