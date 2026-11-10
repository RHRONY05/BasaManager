import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { apiFetch } from '../../lib/api/client';
import { useBuildings } from '../../lib/api/buildings';
import type { UnitSummary } from '@bm/shared/api/buildings';
import { CreateLeaseDialog } from './CreateLeaseDialog';

export default function CreateLeasePage() {
  const [params] = useSearchParams();
  const unitId = params.get('unitId');
  const navigate = useNavigate();
  const { data: buildings = [] } = useBuildings();

  const { data: allUnits = [] } = useQuery<UnitSummary[]>({
    queryKey: [
      'all-building-units',
      buildings
        .map((b) => b.id)
        .sort()
        .join(','),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        buildings.map((b) =>
          apiFetch<UnitSummary[]>(`/api/buildings/${b.id}/units`).catch(() => [] as UnitSummary[]),
        ),
      );
      return results.flat();
    },
    enabled: buildings.length > 0,
  });

  const preselectedUnit = allUnits.find((u) => u.id === unitId) ?? null;

  return (
    <CreateLeaseDialog
      isOpen={true}
      onClose={() => navigate(-1)}
      units={allUnits}
      preselectedUnit={preselectedUnit}
      onSuccess={(lease) => navigate(`/l/leases/${lease.id}`)}
    />
  );
}
