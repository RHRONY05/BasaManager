import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { keys } from './keys';
import type {
  OrgDetail,
  UpdateOrgRequest,
  OrgMember,
  OrgInvite,
  InviteCaretakerRequest,
  UpdateCaretakerBuildingsRequest,
} from '@bm/shared/api/org';

export function useOrg() {
  return useQuery({
    queryKey: keys.org(),
    queryFn: () => apiFetch<OrgDetail>('/api/org'),
  });
}

export function useUpdateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrgRequest) =>
      apiFetch<OrgDetail>('/api/org', {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.org() });
      void queryClient.invalidateQueries({ queryKey: keys.me() });
    },
  });
}

export function useOrgMembers() {
  return useQuery({
    queryKey: keys.members(),
    queryFn: () => apiFetch<OrgMember[]>('/api/org/members'),
  });
}

export function useOrgInvites() {
  return useQuery({
    queryKey: keys.invites(),
    queryFn: () => apiFetch<OrgInvite[]>('/api/org/invites'),
  });
}

export function useInviteCaretaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteCaretakerRequest) =>
      apiFetch<OrgInvite>('/api/org/invites', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.invites() });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/org/invites/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.invites() });
    },
  });
}

export function useUpdateCaretakerBuildings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, data }: { membershipId: string; data: UpdateCaretakerBuildingsRequest }) =>
      apiFetch<{ membershipId: string; buildingIds: string[] }>(
        `/api/org/members/${membershipId}/buildings`,
        {
          method: 'PUT',
          body: data,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members() });
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      apiFetch<{ success: boolean }>(`/api/org/members/${membershipId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members() });
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
    },
  });
}
