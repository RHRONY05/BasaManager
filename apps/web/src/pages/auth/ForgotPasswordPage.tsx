import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordRequestSchema, type ForgotPasswordRequest } from '@bm/shared';
import { MailCheck, AlertCircle } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    if (errors.email) {
      setFocus('email');
    }
  }, [errors, setFocus]);

  const onSubmit = async (values: ForgotPasswordRequest) => {
    setFormError(null);
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: values,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') {
        setFormError(t('auth.rateLimited'));
      } else {
        // Always show the same safe message on success or standard failure
        setSubmitted(true);
      }
    }
  };

  if (submitted) {
    return (
      <div className="card card--tight bg-surface p-6 sm:p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-5 w-full">
        <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
          <MailCheck className="w-6 h-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">{t('auth.resetSentTitle')}</h1>
          <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.resetSentSub')}</p>
        </div>
        <Link
          to="/login"
          data-allow-wrap
          className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center mt-2"
        >
          {t('auth.backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t('auth.forgotPasswordTitle')}</h1>
        <p className="text-sm text-fg-secondary">{t('auth.forgotPasswordSub')}</p>
      </div>

      {formError && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-sm"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-danger-primary mt-0.5" aria-hidden="true" />
          <span className="font-medium">{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="email" className="label text-sm font-semibold text-fg">
            {t('auth.email')}
          </label>
          <input
            {...register('email')}
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'email-error' : undefined}
            placeholder={t('auth.emailPlaceholder')}
            className={`input ${errors.email ? 'border-danger-primary' : ''}`}
          />
          {errors.email && (
            <span
              id="email-error"
              className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.email.message}</span>
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-allow-wrap
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.sendResetLink')}</span>
        </button>
      </form>

      <p className="text-sm text-fg-secondary">
        <Link to="/login" className="text-accent-text font-medium hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
