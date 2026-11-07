import { useTranslation } from 'react-i18next';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-6 text-center space-y-4 max-w-md mx-auto"
    >
      <div className="text-fg font-medium">
        {message || t('status.error')}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center min-h-tap min-w-tap px-4 py-2 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors whitespace-nowrap cursor-pointer"
        >
          {t('actions.retry')}
        </button>
      )}
    </div>
  );
}
