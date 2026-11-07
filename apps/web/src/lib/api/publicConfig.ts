import { queryOptions, useQuery } from '@tanstack/react-query';
import { publicConfigSchema, type PublicConfig } from '@bm/shared';
import { apiFetch } from './client';
import { keys } from './keys';

export const publicConfigQuery = queryOptions({
  queryKey: keys.publicConfig(),
  queryFn: ({ signal }) =>
    apiFetch<PublicConfig>('/api/public-config', {
      schema: publicConfigSchema,
      signal,
    }),
});

export function usePublicConfig() {
  return useQuery(publicConfigQuery);
}
