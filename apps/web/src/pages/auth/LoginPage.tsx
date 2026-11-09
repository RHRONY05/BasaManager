import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@bm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Lock } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';
import { homeFor, sanitizeNext } from '../../app/auth/guards';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { PasswordInput } from '../../components/ui/PasswordInput';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [formError, setFormError] = useState<{
    code: string;
    message: string;
    minutes?: number;
  } | null>(null);

  const googleFailed = searchParams.get('error') === 'google_failed';
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Focus the first field with validation error
  useEffect(() => {
    if (errors.email) {
      setFocus('email');
    } else if (errors.password) {
      setFocus('password');
    }
  }, [errors, setFocus]);

  const onSubmit = async (values: LoginRequest) => {
    setFormError(null);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: values,
      });

      // Fetch current user session and determine destination
      let role: string | null = null;
      try {
        const meData = await apiFetch<{
          user: { id: string; email: string; fullName: string; emailVerified: boolean };
          memberships: {
            orgId: string;
            orgName: string;
            role: 'landlord' | 'caretaker' | 'tenant';
            status: string;
          }[];
        }>('/api/me');
        const active = meData.memberships.find((m) => m.status === 'active');
        role = active?.role ?? meData.memberships[0]?.role ?? null;
      } catch {
        // Fallback
      }
      void queryClient.invalidateQueries({ queryKey: keys.me() });

      const nextParam = sanitizeNext(searchParams.get('next'));
      if (nextParam) {
        navigate(nextParam, { replace: true });
        return;
      }

      navigate(homeFor(role), { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'ACCOUNT_LOCKED') {
          // Extract remaining minutes from message (e.g. "Try again in 14 minutes")
          const match = err.message.match(/(\d+)\s*minutes?/i);
          const minutes = match && match[1] ? parseInt(match[1], 10) : 15;
          setFormError({
            code: 'ACCOUNT_LOCKED',
            message: t('auth.accountLockedWithReset', { minutes }),
            minutes,
          });
        } else if (err.code === 'INVALID_CREDENTIALS') {
          setFormError({
            code: 'INVALID_CREDENTIALS',
            message: t('auth.invalidCredentials'),
          });
        } else if (err.code === 'RATE_LIMITED') {
          setFormError({
            code: 'RATE_LIMITED',
            message: t('auth.rateLimited'),
          });
        } else {
          setFormError({
            code: err.code,
            message: err.message,
          });
        }
      } else {
        setFormError({
          code: 'INTERNAL',
          message: t('status.error'),
        });
      }
    }
  };

  const { ref: emailRef, ...emailRest } = register('email');

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t('auth.loginTitle')}</h1>
        <p className="text-sm text-fg-secondary">{t('auth.loginSub')}</p>
      </div>

      {/* Google Sign-in failure alert */}
      {googleFailed && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-sm"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-danger-primary mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold">{t('auth.googleFailed')}</span>
          </div>
        </div>
      )}

      {/* Form Error Banner */}
      {formError && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-sm"
          role="alert"
        >
          {formError.code === 'ACCOUNT_LOCKED' ? (
            <Lock className="w-5 h-5 shrink-0 text-danger-primary mt-0.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-danger-primary mt-0.5" aria-hidden="true" />
          )}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="font-medium leading-relaxed">{formError.message}</span>
            {formError.code === 'ACCOUNT_LOCKED' && (
              <div className="pt-1">
                <Link
                  to="/forgot-password"
                  className="btn btn--secondary text-xs px-3 py-1 font-semibold border-danger-border text-danger-text inline-flex"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google OAuth Button */}
      <GoogleButton>{t('auth.continueWithGoogle')}</GoogleButton>

      {/* Divider */}
      <div className="divider-text flex items-center gap-3 text-xs uppercase text-fg-muted">
        <span className="flex-1 h-px bg-border" />
        <span>{t('auth.orWithEmail')}</span>
        <span className="flex-1 h-px bg-border" />
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        {/* Email Field */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="email" className="label text-sm font-semibold text-fg">
            {t('auth.email')}
          </label>
          <input
            {...emailRest}
            ref={(e) => {
              emailRef(e);
              emailInputRef.current = e;
            }}
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

        {/* Password Field */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="label text-sm font-semibold text-fg">
              {t('auth.password')}
            </label>
            <Link
              to="/forgot-password"
              className="text-xs text-accent-text hover:underline focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <PasswordInput
            {...register('password')}
            id="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className={errors.password ? 'border-danger-primary' : ''}
          />
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

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          data-allow-wrap
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.signIn')}</span>
        </button>
      </form>

      <p className="text-sm text-fg-secondary">
        {t('auth.newLandlordPrompt')}{' '}
        <Link to="/signup" className="text-accent-text font-medium hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
    </div>
  );
}
