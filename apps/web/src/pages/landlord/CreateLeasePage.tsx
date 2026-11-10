import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/api/client';
import { useBuildings } from '../../lib/api/buildings';
import type { UnitSummary } from '@bm/shared/api/buildings';
import { CreateLeaseDialog } from './CreateLeaseDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export default function CreateLeasePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const unitId = params.get('unitId');
  const navigate = useNavigate();
  const {
    data: buildings = [],
    isPending: buildingsPending,
    isError: buildingsError,
    error: bErr,
    refetch: refetchB,
  } = useBuildings();

  const {
    data: allUnits = [],
    isPending: unitsPending,
    isError: unitsError,
    error: uErr,
    refetch: refetchU,
  } = useQuery<UnitSummary[]>({
    queryKey: [
      'all-building-units',
      buildings
        .map((b) => b.id)
        .sort()
        .join(','),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        buildings.map((b) => apiFetch<UnitSummary[]>(`/api/buildings/${b.id}/units`)),
      );
      return results.flat();
    },
    enabled: buildings.length > 0,
  });

  if (buildingsError || unitsError) {
    const msg = (bErr ?? uErr)?.message ?? t('status.error');
    return (
      <div className="max-w-xl mx-auto py-8">
        <ErrorState
          message={msg}
          onRetry={() => {
            void refetchB();
            void refetchU();
          }}
        />
      </div>
    );
  }

  const isLoading = buildingsPending || (buildings.length > 0 && unitsPending);

  if (isLoading) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-4 max-w-xl mx-auto py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const preselectedUnit = allUnits.find((u) => u.id === unitId) ?? null;

  return (
    <CreateLeaseDialog
      key={preselectedUnit?.id ?? unitId ?? 'loaded'}
      isOpen={true}
      onClose={() => navigate(-1)}
      units={allUnits}
      preselectedUnit={preselectedUnit}
      onSuccess={(lease) => navigate(`/l/leases/${lease.id}`)}
    />
  );
}
