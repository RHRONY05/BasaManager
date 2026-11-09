import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Link2Off } from 'lucide-react';
import { apiFetch, ApiRequestError } from '../../lib/api/client';
import { useAuth } from '../../app/auth/AuthContext';
import { homeFor } from '../../app/auth/guards';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { status: authStatus, role } = useAuth();

  const token = searchParams.get('token');
  const [verifying, setVerifying] = useState(Boolean(token));
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'missing_token');
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;

    async function verify() {
      try {
        await apiFetch('/api/auth/verify-email', {
          method: 'POST',
          body: { token },
        });
        setVerified(true);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setError(err.message);
        } else {
          setError(t('auth.linkExpiredTitle'));
        }
      } finally {
        setVerifying(false);
      }
    }

    void verify();
  }, [token, t]);

  const handleContinue = () => {
    if (authStatus === 'signedIn') {
      navigate(homeFor(role), { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  if (verifying) {
    return (
      <div className="card card--tight bg-surface p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-4 w-full">
        <span className="w-12 h-12 rounded-full bg-accent-soft text-accent-text flex items-center justify-center shrink-0">
          <span className="spinner" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold text-fg">{t('auth.verifyingEmail')}</h1>
      </div>
    );
  }

  if (verified) {
    return (
      <div className="card card--tight bg-surface p-8 rounded-xl border border-border shadow-md flex flex-col items-center text-center gap-5 w-full">
        <span className="w-12 h-12 rounded-full bg-success-soft text-success-text flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">{t('auth.emailVerifiedTitle')}</h1>
          <p className="text-sm text-fg-secondary leading-relaxed">{t('auth.emailVerifiedSub')}</p>
        </div>
        <button
          type="button"
          onClick={handleContinue}
          data-allow-wrap
          className="btn btn--primary btn--block font-semibold bg-accent text-accent-fg hover:bg-accent-hover min-h-control rounded-md flex items-center justify-center"
        >
          {t('auth.continue')}
        </button>
      </div>
    );
  }

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
        <p className="text-sm text-fg-secondary leading-relaxed">
          {error && error !== 'missing_token' ? error : t('auth.linkExpiredSub')}
        </p>
      </div>
      <Link
        to="/login"
        data-allow-wrap
        className="btn btn--secondary btn--block font-semibold border-border-strong text-fg hover:bg-surface-hover min-h-control rounded-md flex items-center justify-center"
      >
        {t('auth.backToSignIn')}
      </Link>
    </div>
  );
}
