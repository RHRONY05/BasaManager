export const keys = {
  publicConfig: () => ['public-config'] as const,
  me: () => ['me'] as const,
  sessions: () => ['me', 'sessions'] as const,
  invite: (token: string) => ['invite', token] as const,
  org: () => ['org'] as const,
  members: () => ['org', 'members'] as const,
  invites: () => ['org', 'invites'] as const,
  buildings: () => ['buildings'] as const,
  building: (id: string) => ['buildings', id] as const,
  buildingUnits: (buildingId: string) => ['buildings', buildingId, 'units'] as const,
};
