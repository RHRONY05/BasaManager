import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { keys } from './keys';
import type {
  Building,
  CreateBuildingRequest,
  UpdateBuildingRequest,
  UnitSummary,
  CreateUnitRequest,
  UpdateUnitRequest,
} from '@bm/shared/api/buildings';

export function useBuildings() {
  return useQuery({
    queryKey: keys.buildings(),
    queryFn: () => apiFetch<Building[]>('/api/buildings'),
  });
}

export function useBuilding(id: string | undefined) {
  return useQuery({
    queryKey: id ? keys.building(id) : ['buildings', 'undefined'],
    queryFn: () => apiFetch<Building>(`/api/buildings/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBuildingRequest) =>
      apiFetch<Building>('/api/buildings', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
    },
  });
}

export function useUpdateBuilding(defaultBuildingId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateBuildingRequest & { id?: string }) => {
      const bId = id ?? defaultBuildingId;
      if (!bId) throw new Error('buildingId is required');
      return apiFetch<Building>(`/api/buildings/${bId}`, {
        method: 'PATCH',
        body: data,
      });
    },
    onSuccess: (updated, variables) => {
      const bId = variables.id ?? defaultBuildingId;
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
      if (bId) {
        void queryClient.invalidateQueries({ queryKey: keys.building(bId) });
      }
      return updated;
    },
  });
}

export function useArchiveBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (buildingId: string) =>
      apiFetch<{ success: boolean }>(`/api/buildings/${buildingId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
    },
  });
}

export function useBuildingUnits(buildingId: string | undefined) {
  return useQuery({
    queryKey: buildingId ? keys.buildingUnits(buildingId) : ['buildings', 'undefined', 'units'],
    queryFn: () => apiFetch<UnitSummary[]>(`/api/buildings/${buildingId}/units`),
    enabled: Boolean(buildingId),
  });
}

export function useCreateUnit(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUnitRequest) =>
      apiFetch<UnitSummary>(`/api/buildings/${buildingId}/units`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.buildingUnits(buildingId) });
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
      void queryClient.invalidateQueries({ queryKey: keys.building(buildingId) });
    },
  });
}

export function useUpdateUnit(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateUnitRequest & { id: string }) =>
      apiFetch<UnitSummary>(`/api/units/${id}`, {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.buildingUnits(buildingId) });
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
      void queryClient.invalidateQueries({ queryKey: keys.building(buildingId) });
    },
  });
}

export function useArchiveUnit(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (unitId: string) =>
      apiFetch<{ success: boolean }>(`/api/units/${unitId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.buildingUnits(buildingId) });
      void queryClient.invalidateQueries({ queryKey: keys.buildings() });
      void queryClient.invalidateQueries({ queryKey: keys.building(buildingId) });
    },
  });
}
