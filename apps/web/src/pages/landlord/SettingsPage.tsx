import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AlertCircle, User, Check } from 'lucide-react';
import { useOrg, useUpdateOrg } from '../../lib/api/org';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data: org, isPending, isError, error, refetch } = useOrg();
  const updateMutation = useUpdateOrg();

  const [nameInput, setNameInput] = useState<string | null>(null);
  const name = nameInput ?? org?.name ?? '';
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaveSuccess(false);

    if (!name.trim()) {
      setFormError(t('settingsPage.orgName') + ' is required');
      return;
    }

    try {
      await updateMutation.mutateAsync({ name: name.trim() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setFormError(msg);
    }
  };

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <div>
        <h1 className="text-2xl font-bold text-fg break-words">{t('headings.settings')}</h1>
        <p className="text-sm text-fg-muted">Manage your organisation profile and configuration.</p>
      </div>

      {isError ? (
        <ErrorState message={error?.message ?? t('status.error')} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div data-skeleton aria-busy="true" className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      ) : (
        <div className="card">
          {saveSuccess && (
            <div className="p-3 bg-accent-soft text-accent-text text-sm rounded-md font-medium flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span>{t('settingsPage.saved')}</span>
            </div>
          )}

          {formError && (
            <div role="alert" className="field-error">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="field">
              <label htmlFor="org-name" className="label">
                {t('settingsPage.orgName')}
              </label>
              <input
                id="org-name"
                type="text"
                required
                value={name}
                onChange={(e) => setNameInput(e.target.value)}
                className="input"
              />
              <p className="hint text-xs">{t('settingsPage.orgNameHint')}</p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                aria-busy={updateMutation.isPending}
                className="btn btn--primary"
              >
                {updateMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
                {t('settingsPage.save')}
              </button>
            </div>
          </form>

          <div className="divider my-2" />

          <div className="flex items-center gap-3 text-sm text-fg-muted">
            <User className="h-4 w-4 text-accent shrink-0" />
            <span>
              {t('settingsPage.accountLink')}{' '}
              <Link to="/account" className="btn--link">
                {t('headings.account')}
              </Link>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
