import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiRequestError } from './client.js';
import { keys } from './keys.js';
import type {
  BillResponse,
  ListBillsQuery,
  RunBillingInput,
  IssueReadyBillsInput,
  AddAdjustmentInput,
  WaiveLateFeeInput,
  VoidBillInput,
  MeterReadingInput,
  MeterReadingItem,
  DuesResponse,
} from '@bm/shared/api/billing';

export function useBills(query?: ListBillsQuery) {
  const searchParams = new URLSearchParams();
  if (query?.status) searchParams.set('status', query.status);
  if (query?.buildingId) searchParams.set('buildingId', query.buildingId);
  if (query?.month) searchParams.set('month', query.month);
  if (query?.leaseId) searchParams.set('leaseId', query.leaseId);
  const qs = searchParams.toString();
  const url = qs ? `/api/bills?${qs}` : '/api/bills';

  return useQuery({
    queryKey: keys.bills(query as Record<string, unknown>),
    queryFn: () => apiFetch<BillResponse[]>(url),
  });
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.bill(id) : ['bills', 'undefined'],
    queryFn: () => apiFetch<BillResponse>(`/api/bills/${id}`),
    enabled: Boolean(id),
  });
}

export function useReadings(buildingId: string | undefined, month: string | undefined) {
  const enabled = Boolean(buildingId && month);
  const url = enabled
    ? `/api/readings?buildingId=${encodeURIComponent(buildingId!)}&month=${encodeURIComponent(month!)}`
    : '/api/readings';

  return useQuery({
    queryKey: buildingId && month ? keys.readings(buildingId, month) : ['readings', 'undefined'],
    queryFn: () => apiFetch<MeterReadingItem[]>(url),
    enabled,
  });
}

export function useDues() {
  return useQuery({
    queryKey: keys.dues(),
    queryFn: async () => {
      try {
        return await apiFetch<DuesResponse>('/api/dues');
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          return { bills: [], creditPoisha: 0, totalPoisha: 0 };
        }
        throw err;
      }
    },
  });
}

export function useRunBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RunBillingInput) =>
      apiFetch<{ created: number; skipped: number }>('/api/billing/run', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['readings'] });
    },
  });
}

export function useEnterReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MeterReadingInput) =>
      apiFetch<{ id: string; reading: number; units: number; amountPoisha: number }>('/api/readings', {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['readings'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useIssueBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) =>
      apiFetch<BillResponse>(`/api/bills/${billId}/issue`, {
        method: 'POST',
      }),
    onSuccess: (_, billId) => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: keys.bill(billId) });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useIssueReadyBills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IssueReadyBillsInput) =>
      apiFetch<{ issued: number; skipped: number }>('/api/bills/issue-ready', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useAddAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, data }: { billId: string; data: AddAdjustmentInput }) =>
      apiFetch<BillResponse>(`/api/bills/${billId}/adjustments`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: (_, { billId }) => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: keys.bill(billId) });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useWaiveLateFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, data }: { billId: string; data: WaiveLateFeeInput }) =>
      apiFetch<BillResponse>(`/api/bills/${billId}/late-fee/waive`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: (_, { billId }) => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: keys.bill(billId) });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useVoidBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, data }: { billId: string; data?: VoidBillInput }) =>
      apiFetch<BillResponse>(`/api/bills/${billId}/void`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: (_, { billId }) => {
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: keys.bill(billId) });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}
