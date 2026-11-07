import { useTranslation } from 'react-i18next';
import { usePublicConfig } from '../../lib/api/publicConfig';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/ErrorState';

export function PlaceholderDataRegion() {
  const { t } = useTranslation();
  const { data: config, isPending, isError, error, refetch } = usePublicConfig();

  if (isPending) {
    return (
      <div data-skeleton aria-busy="true" className="rounded-lg border border-border bg-surface p-6 space-y-3 max-w-xl">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-xl">
        <ErrorState
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 max-w-xl space-y-2">
      <div className="text-sm font-medium text-fg-muted uppercase tracking-wider">
        System Status
      </div>
      <div className="text-base text-fg font-medium">
        {t('status.env', { env: config.appEnv })}
      </div>
    </div>
  );
}
