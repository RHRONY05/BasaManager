import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiRequestError } from './client';
import { keys } from './keys';
import type {
  CreateLeaseInput,
  ListLeasesQuery,
  RecordDepositInput,
  LeaseDto,
  TenantHistoryDto,
} from '@bm/shared/api/leases';

export function useLeases(query?: ListLeasesQuery) {
  const searchParams = new URLSearchParams();
  if (query?.status) searchParams.set('status', query.status);
  if (query?.buildingId) searchParams.set('buildingId', query.buildingId);
  const qs = searchParams.toString();
  const url = qs ? `/api/leases?${qs}` : '/api/leases';

  return useQuery({
    queryKey: keys.leases(query as Record<string, unknown>),
    queryFn: () => apiFetch<LeaseDto[]>(url),
  });
}

export function useLease(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.lease(id) : ['leases', 'undefined'],
    queryFn: () => apiFetch<LeaseDto>(`/api/leases/${id}`),
    enabled: Boolean(id),
  });
}

export function useActiveLease(unitId?: string) {
  const url = unitId ? `/api/leases/active?unitId=${encodeURIComponent(unitId)}` : '/api/leases/active';
  return useQuery({
    queryKey: keys.activeLease(unitId),
    queryFn: async () => {
      try {
        return await apiFetch<LeaseDto>(url);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
  });
}

export function useCreateLease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeaseInput) =>
      apiFetch<LeaseDto>('/api/leases', {
        method: 'POST',
        body: data,
      }),
    onSuccess: (newLease) => {
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['buildings'] });
      if (newLease?.unitId) {
        void queryClient.invalidateQueries({ queryKey: keys.activeLease(newLease.unitId) });
      }
    },
  });
}

export function useRecordDeposit(leaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordDepositInput) =>
      apiFetch<{ id: string; kind: string; amountPoisha: number; note: string | null }>(
        `/api/leases/${leaseId}/deposit`,
        {
          method: 'POST',
          body: data,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.lease(leaseId) });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
    },
  });
}

export function useResendInvite(leaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ resent: boolean }>(`/api/leases/${leaseId}/resend-invite`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.lease(leaseId) });
    },
  });
}

export function useTenantHistory(membershipId: string | undefined) {
  return useQuery({
    queryKey: membershipId ? keys.tenantHistory(membershipId) : ['tenants', 'undefined', 'history'],
    queryFn: () => apiFetch<TenantHistoryDto>(`/api/tenants/${membershipId}/history`),
    enabled: Boolean(membershipId),
  });
}
