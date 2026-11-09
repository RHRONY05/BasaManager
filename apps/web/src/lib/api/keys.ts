export const keys = {
  publicConfig: () => ['public-config'] as const,
  me: () => ['me'] as const,
  sessions: () => ['me', 'sessions'] as const,
  invite: (token: string) => ['invite', token] as const,
};
