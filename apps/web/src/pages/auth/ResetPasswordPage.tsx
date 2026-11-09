import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Link2Off } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';
import { homeFor, type AppRole } from '../../app/auth/guards';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrength } from '../../components/ui/PasswordStrength';

const resetFormSchema = z.object({
  password: z.string().min(10, 'Password must be at least 10 characters'),
});

type ResetFormValues = z.infer<typeof resetFormSchema>;

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const token = searchParams.get('token');
  const [formError, setFormError] = useState<string | null>(token ? null : 'missing_token');

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: {
      password: '',
    },
  });

  const passwordValue = watch('password');

  useEffect(() => {
    if (errors.password) {
      setFocus('password');
    }
  }, [errors, setFocus]);

  if (!token) {
    return (
      <div
        className="card card--tight bg-surface p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-5 w-full"
        role="alert"
      >
        <span className="w-12 h-12 rounded-full bg-danger-soft text-danger-text flex items-center justify-center shrink-0">
          <Link2Off className="w-6 h-6 text-danger-primary" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">{t('auth.linkExpiredTitle')}</h1>
          <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.linkExpiredSub')}</p>
        </div>
        <Link
          to="/forgot-password"
          className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center"
        >
          {t('auth.requestNewLink')}
        </Link>
      </div>
    );
  }

  const onSubmit = async (values: ResetFormValues) => {
    setFormError(null);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: {
          token,
          password: values.password,
        },
      });

      let role: AppRole | null = null;
      try {
        const meData = await apiFetch<{
          memberships?: Array<{ role: AppRole; status: string }>;
        }>('/api/me');
        const active = meData?.memberships?.find((m) => m.status === 'active');
        role = active?.role ?? meData?.memberships?.[0]?.role ?? null;
      } catch {
        // Fallback
      }
      void queryClient.invalidateQueries({ queryKey: keys.me() });
      navigate(homeFor(role), { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'TOKEN_INVALID') {
          setFormError(t('auth.tokenInvalid'));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError(t('status.error'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t('auth.resetPasswordTitle')}</h1>
        <p className="text-sm text-fg-secondary">{t('auth.resetPasswordSub')}</p>
      </div>

      {formError && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-sm"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-danger-primary mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-medium">{formError}</span>
            {formError === t('auth.tokenInvalid') && (
              <Link to="/forgot-password" className="text-xs font-semibold underline pt-1">
                {t('auth.requestNewLink')}
              </Link>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="password" className="label text-sm font-semibold text-fg">
            {t('auth.newPassword')}
          </label>
          <PasswordInput
            {...register('password')}
            id="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className={errors.password ? 'border-danger-primary' : ''}
          />
          <PasswordStrength password={passwordValue} />
          {errors.password && (
            <span
              id="password-error"
              className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.password.message}</span>
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.setPasswordAndSignIn')}</span>
        </button>
      </form>
    </div>
  );
}
