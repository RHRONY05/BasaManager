import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center space-y-3 max-w-md mx-auto">
      <h3 className="text-lg font-medium text-fg">{title || t('status.empty')}</h3>
      {description && <p className="text-sm text-fg-muted">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
