import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupRequestSchema, type SignupRequest } from '@bm/shared';
import { AlertCircle, Mail, CheckCircle2 } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrength } from '../../components/ui/PasswordStrength';

export default function SignupPage() {
  const { t } = useTranslation();

  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignupRequest>({
    resolver: zodResolver(signupRequestSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      orgName: '',
    },
  });

  const passwordValue = watch('password');

  // Focus the first field with validation error
  useEffect(() => {
    if (errors.fullName) {
      setFocus('fullName');
    } else if (errors.email) {
      setFocus('email');
    } else if (errors.password) {
      setFocus('password');
    } else if (errors.orgName) {
      setFocus('orgName');
    }
  }, [errors, setFocus]);

  // Cooldown timer for resend email
  useEffect(() => {
    if (!signupSuccessEmail || cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [signupSuccessEmail, cooldown]);

  const onSubmit = async (values: SignupRequest) => {
    setFormError(null);
    try {
      await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: values,
      });
      setSignupSuccessEmail(values.email);
      setCooldown(60);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // If email already taken, CONFLICT returns same message as success to prevent enumeration
        if (err.code === 'CONFLICT') {
          setSignupSuccessEmail(values.email);
          setCooldown(60);
          return;
        }
        setFormError(err.message);
      } else {
        setFormError(t('status.error'));
      }
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setResendStatus(null);
    try {
      await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
      });
      setCooldown(60);
      setResendStatus({ ok: true, message: t('auth.verificationResent') });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') {
        setResendStatus({ ok: false, message: t('auth.rateLimited') });
      } else {
        setResendStatus({ ok: false, message: t('status.error') });
      }
    } finally {
      setResending(false);
    }
  };

  // Check your email screen (Success state)
  if (signupSuccessEmail) {
    const minutes = Math.floor(cooldown / 60);
    const seconds = cooldown % 60;
    const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    return (
      <div className="card card--tight bg-surface p-6 sm:p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-5 w-full">
        <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
          <Mail className="w-6 h-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">
            {t('auth.checkEmailTitle')}
          </h1>
          <p className="text-sm text-fg-secondary leading-relaxed">
            {t('auth.checkEmailSub', { email: signupSuccessEmail })}
          </p>
        </div>

        {resendStatus && (
          <div
            className={`flex items-center gap-2 p-3 rounded-md text-xs w-full text-left ${
              resendStatus.ok
                ? 'bg-success-soft text-success-text border border-success-border'
                : 'bg-danger-soft text-danger-text border border-danger-border'
            }`}
            role="alert"
          >
            {resendStatus.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{resendStatus.message}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="btn btn--secondary btn--block font-semibold disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {resending && <span className="spinner" aria-hidden="true" />}
          <span>
            {cooldown > 0 ? t('auth.resendIn', { time: formattedTime }) : t('auth.resendVerification')}
          </span>
        </button>

        <Link to="/login" className="text-sm text-accent-text font-medium hover:underline pt-2">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t('auth.createLandlordAccount')}</h1>
        <p className="text-sm text-fg-secondary">{t('auth.signupSub')}</p>
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

      {/* Google OAuth Button */}
      <GoogleButton>{t('auth.signUpWithGoogle')}</GoogleButton>

      {/* Divider */}
      <div className="divider-text flex items-center gap-3 text-xs uppercase text-fg-muted">
        <span className="flex-1 h-px bg-border" />
        <span>{t('auth.orWithEmail')}</span>
        <span className="flex-1 h-px bg-border" />
      </div>

      {/* Signup Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        {/* Full Name */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="fullName" className="label text-sm font-semibold text-fg">
            {t('auth.fullName')}
          </label>
          <input
            {...register('fullName')}
            id="fullName"
            autoComplete="name"
            aria-invalid={errors.fullName ? 'true' : 'false'}
            aria-describedby={errors.fullName ? 'fullname-error' : undefined}
            placeholder={t('auth.fullNamePlaceholder')}
            className={`input ${errors.fullName ? 'border-danger-primary' : ''}`}
          />
          {errors.fullName && (
            <span
              id="fullname-error"
              className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.fullName.message}</span>
            </span>
          )}
        </div>

        {/* Email */}
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
            aria-describedby={errors.email ? 'email-error' : 'email-hint'}
            placeholder={t('auth.emailPlaceholder')}
            className={`input ${errors.email ? 'border-danger-primary' : ''}`}
          />
          <span id="email-hint" className="hint text-xs text-fg-muted">
            {t('auth.emailConfirmHint')}
          </span>
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

        {/* Password */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="password" className="label text-sm font-semibold text-fg">
            {t('auth.password')}
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

        {/* Organisation Name */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="orgName" className="label text-sm font-semibold text-fg">
            {t('auth.orgName')}
          </label>
          <input
            {...register('orgName')}
            id="orgName"
            aria-invalid={errors.orgName ? 'true' : 'false'}
            aria-describedby={errors.orgName ? 'orgname-error' : 'orgname-hint'}
            placeholder="Chowdhury Properties"
            className={`input ${errors.orgName ? 'border-danger-primary' : ''}`}
          />
          <span id="orgname-hint" className="hint text-xs text-fg-muted">
            {t('auth.orgNameHint')}
          </span>
          {errors.orgName && (
            <span
              id="orgname-error"
              className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{errors.orgName.message}</span>
            </span>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.createAccount')}</span>
        </button>
      </form>

      <p className="text-sm text-fg-secondary">
        {t('auth.alreadyHaveAccount')}{' '}
        <Link to="/login" className="text-accent-text font-medium hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
