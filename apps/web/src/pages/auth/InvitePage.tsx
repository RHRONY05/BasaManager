import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { invitePreviewSchema, type InvitePreview } from '@bm/shared';
import { UserX, Link2Off, AlertCircle } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';
import { useAuth } from '../../app/auth/AuthContext';
import { homeFor, type AppRole } from '../../app/auth/guards';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrength } from '../../components/ui/PasswordStrength';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';

const acceptFormSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  password: z.string().min(10, 'Password must be at least 10 characters'),
});

type AcceptFormValues = z.infer<typeof acceptFormSchema>;

export default function InvitePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status: authStatus, user, signOut } = useAuth();

  const [formError, setFormError] = useState<string | null>(null);
  const [acceptingExisting, setAcceptingExisting] = useState(false);

  const {
    data: invite,
    isLoading,
    isError,
    error,
  } = useQuery<InvitePreview>({
    queryKey: keys.invite(token || ''),
    queryFn: () =>
      apiFetch<InvitePreview>(`/api/invites/${encodeURIComponent(token || '')}`, {
        schema: invitePreviewSchema,
      }),
    enabled: Boolean(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AcceptFormValues>({
    resolver: zodResolver(acceptFormSchema),
    defaultValues: {
      fullName: '',
      password: '',
    },
  });

  const passwordValue = watch('password');

  useEffect(() => {
    if (errors.fullName) {
      setFocus('fullName');
    } else if (errors.password) {
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
          to="/login"
          className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center"
        >
          {t('auth.backToSignIn')}
        </Link>
      </div>
    );
  }

  if (isLoading || authStatus === 'loading') {
    return <RouteSkeleton />;
  }

  if (isError || !invite) {
    const errorMsg =
      error instanceof ApiRequestError && error.code === 'TOKEN_INVALID'
        ? t('auth.tokenInvalid')
        : t('auth.linkExpiredTitle');

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
          <p className="text-sm text-fg-secondary leading-relaxed">{errorMsg}</p>
        </div>
        <Link
          to="/login"
          className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center"
        >
          {t('auth.backToSignIn')}
        </Link>
      </div>
    );
  }

  // Case 1: User is signed in with a different email
  if (authStatus === 'signedIn' && user && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <div
        className="card card--tight bg-surface p-6 sm:p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-5 w-full"
        role="alert"
      >
        <span className="w-12 h-12 rounded-full bg-warning-soft text-warning-text flex items-center justify-center shrink-0">
          <UserX className="w-6 h-6 text-warning-primary" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">{t('auth.inviteMismatchTitle')}</h1>
          <p className="text-sm text-fg-secondary leading-relaxed">
            {t('auth.inviteMismatchSub', {
              currentEmail: user.email,
              inviteEmail: invite.email,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center"
        >
          {t('auth.signOutAndContinue')}
        </button>
      </div>
    );
  }

  // Case 2: User is signed in with the matching email -> just accept
  if (authStatus === 'signedIn' && user && user.email.toLowerCase() === invite.email.toLowerCase()) {
    const handleAcceptExisting = async () => {
      setFormError(null);
      setAcceptingExisting(true);
      try {
        await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
          method: 'POST',
          body: {},
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
          setFormError(err.message);
        } else {
          setFormError(t('status.error'));
        }
      } finally {
        setAcceptingExisting(false);
      }
    };

    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-wider font-semibold text-accent-text">
            {t('auth.invitation')}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            {t('auth.joinOrg', { orgName: invite.orgName })}
          </h1>
          <p className="text-sm text-fg-secondary">
            {t('auth.invitedBy', { inviterName: invite.inviterName, role: invite.role })}
          </p>
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

        <div className="card bg-bg p-4 rounded-lg border border-border flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-secondary">{t('auth.orgName')}</span>
            <span className="font-semibold text-fg">{invite.orgName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-secondary">{t('auth.role')}</span>
            <span className="font-semibold capitalize text-fg">{invite.role}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAcceptExisting}
          disabled={acceptingExisting}
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {acceptingExisting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.acceptInvitation')}</span>
        </button>
      </div>
    );
  }

  // Case 3: Anonymous / new user -> name + password form or Google button
  const onSubmitNewUser = async (values: AcceptFormValues) => {
    setFormError(null);
    try {
      await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: {
          fullName: values.fullName,
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
        setFormError(err.message);
      } else {
        setFormError(t('status.error'));
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs uppercase tracking-wider font-semibold text-accent-text">
          {t('auth.invitation')}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-fg">
          {t('auth.joinOrg', { orgName: invite.orgName })}
        </h1>
        <p className="text-sm text-fg-secondary">
          {t('auth.invitedBy', { inviterName: invite.inviterName, role: invite.role })}
        </p>
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

      {/* Google OAuth Button with invite token */}
      <GoogleButton inviteToken={token}>{t('auth.continueWithGoogle')}</GoogleButton>

      {/* Divider */}
      <div className="divider-text flex items-center gap-3 text-xs uppercase text-fg-muted">
        <span className="flex-1 h-px bg-border" />
        <span>{t('auth.orSetPassword')}</span>
        <span className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmitNewUser)} className="flex flex-col gap-5" noValidate>
        {/* Email (read-only for invite) */}
        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="invite-email" className="label text-sm font-semibold text-fg">
            {t('auth.email')}
          </label>
          <input
            id="invite-email"
            type="email"
            value={invite.email}
            disabled
            className="input bg-bg-muted cursor-not-allowed opacity-75"
          />
          <span className="hint text-xs text-fg-muted">{t('auth.inviteEmailHint')}</span>
        </div>

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

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn--primary btn--block btn--lg font-semibold bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 min-h-control rounded-md flex items-center justify-center gap-2"
        >
          {isSubmitting && <span className="spinner" aria-hidden="true" />}
          <span>{t('auth.acceptAndJoin')}</span>
        </button>
      </form>

      <p className="text-sm text-fg-secondary">
        {t('auth.notYouPrompt', { name: invite.email })}{' '}
        <Link to="/login" className="text-accent-text font-medium hover:underline">
          {t('auth.signInAnotherAccount')}
        </Link>{' '}
        {t('auth.explainMismatch')}
      </p>
    </div>
  );
}
