import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';
import { keys } from './keys.js';
import type {
  PaymentResponse,
  CreatePaymentClaimInput,
  RecordPaymentInput,
  ListPaymentsQuery,
  ReceiptDownloadResponse,
  InitOnlinePaymentInput,
  InitOnlinePaymentResponse,
  PaymentIntentResponse,
} from '@bm/shared/api/payments';
import type { UploadFileResponse, SignedUrlResponse } from '@bm/shared/api/files';

export function usePayments(query?: ListPaymentsQuery) {
  const searchParams = new URLSearchParams();
  if (query?.status) searchParams.set('status', query.status);
  if (query?.buildingId) searchParams.set('buildingId', query.buildingId);
  if (query?.leaseId) searchParams.set('leaseId', query.leaseId);
  if (query?.cursor) searchParams.set('cursor', query.cursor);
  if (query?.limit) searchParams.set('limit', String(query.limit));
  const qs = searchParams.toString();
  const url = qs ? `/api/payments?${qs}` : '/api/payments';

  return useQuery({
    queryKey: keys.payments(query as Record<string, unknown>),
    queryFn: () => apiFetch<PaymentResponse[]>(url),
  });
}

export function useSubmitPaymentClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentClaimInput) =>
      apiFetch<PaymentResponse>('/api/payments/claims', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      apiFetch<PaymentResponse>('/api/payments', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      apiFetch<PaymentResponse>(`/api/payments/${paymentId}/confirm`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export function useRejectPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiFetch<PaymentResponse>(`/api/payments/${paymentId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export function useVoidPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiFetch<PaymentResponse>(`/api/payments/${paymentId}/void`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dues'] });
    },
  });
}

export async function uploadFile(
  file: File,
  kind: 'payment_proof' | 'maintenance_photo' | 'document',
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  return apiFetch<UploadFileResponse>('/api/files', {
    method: 'POST',
    body: formData,
  });
}

export async function getFileSignedUrl(fileId: string, variant?: 'thumb'): Promise<SignedUrlResponse> {
  const qs = variant ? `?variant=${variant}` : '';
  return apiFetch<SignedUrlResponse>(`/api/files/${fileId}/url${qs}`);
}

export async function getReceiptDownloadUrl(receiptId: string): Promise<ReceiptDownloadResponse> {
  return apiFetch<ReceiptDownloadResponse>(`/api/receipts/${receiptId}/download`);
}

export function useInitOnlinePayment() {
  return useMutation({
    mutationFn: (data: InitOnlinePaymentInput) =>
      apiFetch<InitOnlinePaymentResponse>('/api/payments/sslcommerz/init', {
        method: 'POST',
        body: data,
      }),
  });
}

export function usePaymentIntent(tranId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['paymentIntent', tranId],
    queryFn: () => apiFetch<PaymentIntentResponse>(`/api/payments/sslcommerz/intents/${tranId}`),
    enabled: Boolean(tranId) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status === 'initiated') {
        return 2000;
      }
      return false;
    },
  });
}
