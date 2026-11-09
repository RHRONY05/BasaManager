import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  sessionDeviceSchema,
  type SessionDevice,
  type UpdateMeRequest,
  type ChangePasswordRequest,
  type UserProfile,
} from '@bm/shared';
import {
  Laptop,
  Smartphone,
  MonitorSmartphone,
  CircleCheck,
  AlertCircle,
  LogOut,
  Trash2,
  BadgeCheck,
} from 'lucide-react';
import { apiFetch, ApiRequestError, setActiveOrgId } from '../../lib/api/client';
import { keys } from '../../lib/api/keys';
import { useAuth } from '../../app/auth/AuthContext';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrength } from '../../components/ui/PasswordStrength';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';

function getDeviceInfo(userAgent?: string | null): { name: string; icon: typeof Laptop } {
  if (!userAgent) {
    return { name: 'Unknown device', icon: MonitorSmartphone };
  }
  const ua = userAgent.toLowerCase();
  let os = 'Unknown OS';
  let icon = MonitorSmartphone;

  if (ua.includes('windows')) {
    os = 'Windows';
    icon = Laptop;
  } else if (ua.includes('android')) {
    os = 'Android';
    icon = Smartphone;
  } else if (ua.includes('iphone')) {
    os = 'iPhone';
    icon = Smartphone;
  } else if (ua.includes('ipad')) {
    os = 'iPad';
    icon = MonitorSmartphone;
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    os = 'macOS';
    icon = Laptop;
  } else if (ua.includes('linux')) {
    os = 'Linux';
    icon = Laptop;
  }

  let browser = 'Browser';
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  }

  return { name: `${browser} on ${os}`, icon };
}

function formatSessionDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// ── Profile Section ──────────────────────────────────────────────────────────
function ProfileSection({ user }: { user: UserProfile | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileError, setProfileError] = useState<string | null>(null);

  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateMeRequest) =>
      apiFetch('/api/me', {
        method: 'PATCH',
        body: data,
      }),
    onSuccess: () => {
      setProfileError(null);
      void queryClient.invalidateQueries({ queryKey: keys.me() });
      showToast(t('account.profileUpdated'), 'success');
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        setProfileError(err.message);
      } else {
        setProfileError(t('status.error'));
      }
    },
  });

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    updateProfileMutation.mutate({
      fullName: fullName.trim(),
      phone: phone.trim() || null,
    });
  };

  return (
    <section
      id="profile"
      aria-labelledby="profile-heading"
      className="card rounded-lg border border-border bg-surface p-6 space-y-4 min-w-0"
    >
      <h2 id="profile-heading" className="text-lg font-bold text-fg">
        {t('account.profileTitle')}
      </h2>

      {profileError && (
        <div
          role="alert"
          className="p-3 rounded-md bg-[var(--danger-soft)] border border-danger-border text-danger-text text-sm font-medium flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{profileError}</span>
        </div>
      )}

      <form onSubmit={handleProfileSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="field flex flex-col gap-1.5 min-w-0">
            <label htmlFor="fullName" className="text-sm font-semibold text-fg whitespace-nowrap">
              {t('account.fullName')}
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="h-11 px-3 py-2 rounded-md border border-border bg-surface text-fg text-base focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          <div className="field flex flex-col gap-1.5 min-w-0">
            <label htmlFor="phone" className="text-sm font-semibold text-fg whitespace-nowrap">
              {t('account.phoneOptional')}
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 px-3 py-2 rounded-md border border-border bg-surface text-fg text-base focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>
        </div>

        <div className="field flex flex-col gap-1.5 min-w-0">
          <label htmlFor="email" className="text-sm font-semibold text-fg whitespace-nowrap">
            {t('account.email')}
          </label>
          <input
            id="email"
            type="email"
            value={user?.email || ''}
            disabled
            className="h-11 px-3 py-2 rounded-md border border-border bg-muted text-fg-muted text-base cursor-not-allowed opacity-75"
          />
          <span className="hint flex items-center gap-1.5 text-xs text-fg-muted mt-0.5">
            <BadgeCheck className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
            <span>{user?.emailVerified ? t('account.emailVerified') : t('account.emailUnverified')}</span>
          </span>
        </div>

        <div>
          <button
            type="submit"
            disabled={updateProfileMutation.isPending}
            className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateProfileMutation.isPending ? t('account.profileSaving') : t('account.saveProfile')}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Change Password Section ──────────────────────────────────────────────────
function ChangePasswordSection() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [generalPasswordError, setGeneralPasswordError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: (data: ChangePasswordRequest) =>
      apiFetch('/api/me/change-password', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setCurrentPasswordError(null);
      setNewPasswordError(null);
      setGeneralPasswordError(null);
      showToast(t('account.passwordUpdated'), 'success');
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setCurrentPasswordError(t('account.invalidCurrentPassword'));
        } else {
          setGeneralPasswordError(err.message);
        }
      } else {
        setGeneralPasswordError(t('status.error'));
      }
    },
  });

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setGeneralPasswordError(null);

    let hasError = false;
    if (!currentPassword) {
      setCurrentPasswordError(t('account.currentPasswordRequired'));
      hasError = true;
    }
    if (newPassword.length < 10) {
      setNewPasswordError(t('account.passwordMinLength'));
      hasError = true;
    }
    if (hasError) return;

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  return (
    <section
      id="password"
      aria-labelledby="password-heading"
      className="card rounded-lg border border-border bg-surface p-6 space-y-4 min-w-0"
    >
      <h2 id="password-heading" className="text-lg font-bold text-fg">
        {t('account.changePasswordTitle')}
      </h2>

      {generalPasswordError && (
        <div
          role="alert"
          className="p-3 rounded-md bg-[var(--danger-soft)] border border-danger-border text-danger-text text-sm font-medium flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{generalPasswordError}</span>
        </div>
      )}

      <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Current Password */}
          <div className="field flex flex-col gap-1.5 min-w-0">
            <label htmlFor="currentPassword" className="text-sm font-semibold text-fg whitespace-nowrap">
              {t('account.currentPassword')}
            </label>
            <PasswordInput
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setCurrentPasswordError(null);
              }}
              autoComplete="current-password"
              aria-invalid={currentPasswordError ? 'true' : 'false'}
              aria-describedby={currentPasswordError ? 'current-password-error' : undefined}
              className={currentPasswordError ? 'border-danger-primary' : ''}
            />
            {currentPasswordError && (
              <span
                id="current-password-error"
                role="alert"
                className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{currentPasswordError}</span>
              </span>
            )}
          </div>

          {/* New Password */}
          <div className="field flex flex-col gap-1.5 min-w-0">
            <label htmlFor="newPassword" className="text-sm font-semibold text-fg whitespace-nowrap">
              {t('account.newPassword')}
            </label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setNewPasswordError(null);
              }}
              autoComplete="new-password"
              aria-invalid={newPasswordError ? 'true' : 'false'}
              aria-describedby={newPasswordError ? 'new-password-error' : undefined}
              className={newPasswordError ? 'border-danger-primary' : ''}
            />
            {newPasswordError && (
              <span
                id="new-password-error"
                role="alert"
                className="field-error flex items-center gap-1.5 text-xs text-danger-text font-medium"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{newPasswordError}</span>
              </span>
            )}
            <PasswordStrength password={newPassword} />
            <span className="hint text-xs text-fg-muted">{t('account.passwordHint')}</span>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={changePasswordMutation.isPending}
            className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md border border-border bg-surface text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changePasswordMutation.isPending
              ? t('account.passwordUpdating')
              : t('account.changePasswordBtn')}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Sessions / Devices Section ───────────────────────────────────────────────
function SessionsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    isError: isSessionsError,
    error: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: keys.sessions(),
    queryFn: () =>
      apiFetch<SessionDevice[]>('/api/me/sessions', {
        schema: z.array(sessionDeviceSchema),
      }),
  });

  const [revokeTarget, setRevokeTarget] = useState<SessionDevice | null>(null);
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch(`/api/me/sessions/${sessionId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey: keys.sessions() });
      showToast(t('account.deviceRevoked'), 'success');
    },
  });

  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true);
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
    } catch {
      // Proceed even on failure to ensure client session is wiped
    } finally {
      setIsLoggingOutAll(false);
      setActiveOrgId(null);
      queryClient.clear();
      navigate('/login');
    }
  };

  return (
    <section
      id="sessions"
      aria-labelledby="sessions-heading"
      className="card rounded-lg border border-border bg-surface p-6 space-y-4 min-w-0"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 id="sessions-heading" className="text-lg font-bold text-fg">
          {t('account.devicesTitle')}
        </h2>
        <button
          type="button"
          onClick={handleLogoutAll}
          disabled={isLoggingOutAll}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-danger-border text-danger-text hover:bg-danger-soft text-sm font-medium min-h-tap cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isLoggingOutAll ? t('account.signOutEverywhereLoading') : t('account.signOutEverywhere')}
          </span>
        </button>
      </div>

      {isLoadingSessions ? (
        <div data-skeleton aria-busy="true" className="space-y-3">
          <div className="flex items-center gap-3 py-3 border-b border-border-muted">
            <div className="w-10 h-10 rounded-md bg-muted shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
          </div>
          <div className="flex items-center gap-3 py-3">
            <div className="w-10 h-10 rounded-md bg-muted shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="h-4 w-48 bg-muted rounded" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
          </div>
        </div>
      ) : isSessionsError ? (
        <ErrorState
          message={sessionsError?.message || t('status.error')}
          onRetry={() => void refetchSessions()}
        />
      ) : !sessionsData || sessionsData.length === 0 ? (
        <EmptyState title={t('account.noSessions')} />
      ) : (
        <div className="divide-y divide-border-muted">
          {sessionsData.map((session) => {
            const info = getDeviceInfo(session.userAgent);
            const DeviceIcon = info.icon;
            const isCurrent = session.current;

            return (
              <div key={session.id} className="session flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="session__icon inline-grid place-items-center w-10 h-10 rounded-md bg-muted text-fg-muted shrink-0">
                    <DeviceIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-fg truncate">{info.name}</span>
                      {isCurrent && (
                        <span className="badge badge--success inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-soft)] text-[var(--success-text)] border border-[var(--success-border)] shrink-0">
                          <CircleCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{t('account.thisDevice')}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted truncate">
                      {isCurrent ? t('account.activeNow') : formatSessionDate(session.createdAt)}
                      {session.ip ? ` · ${session.ip}` : ''}
                    </p>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(session)}
                    className="btn btn--secondary btn--sm inline-flex items-center justify-center px-3 py-1 text-xs rounded-md border border-border bg-surface text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap min-h-tap cursor-pointer"
                  >
                    {t('account.signOutDevice')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Revoke Session Confirmation Dialog */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-dialog-title"
            className="dialog relative w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg space-y-4"
          >
            <h3 id="revoke-dialog-title" className="text-lg font-bold text-fg">
              {t('account.revokeConfirmTitle')}
            </h3>
            <p className="text-sm text-fg-muted">{t('account.revokeConfirmDesc')}</p>
            <p className="text-sm font-semibold text-fg">{getDeviceInfo(revokeTarget.userAgent).name}</p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md border border-border bg-surface text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap cursor-pointer"
              >
                {t('account.cancel')}
              </button>
              <button
                type="button"
                disabled={revokeSessionMutation.isPending}
                onClick={() => revokeSessionMutation.mutate(revokeTarget.id)}
                className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md bg-danger text-danger-fg font-medium hover:bg-danger-hover transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {revokeSessionMutation.isPending ? t('account.revoking') : t('account.revokeConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Delete Account Section ───────────────────────────────────────────────────
function DeleteAccountSection({ role, orgName }: { role: string | null; orgName: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE' || !deletePassword) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiFetch('/api/me', {
        method: 'DELETE',
        body: { password: deletePassword },
      });
      setIsDeleteDialogOpen(false);
      setActiveOrgId(null);
      queryClient.clear();
      navigate('/');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'LANDLORD_MUST_TRANSFER') {
          setDeleteError(t('account.landlordMustTransfer'));
        } else {
          setDeleteError(err.message || t('status.error'));
        }
      } else {
        setDeleteError(t('status.error'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section
      id="delete"
      aria-labelledby="delete-heading"
      className="card danger-zone rounded-lg border border-danger-border bg-surface p-6 space-y-4 min-w-0"
    >
      <h2 id="delete-heading" className="text-lg font-bold text-danger-text">
        {t('account.deleteAccountTitle')}
      </h2>
      <p className="text-sm text-fg-muted leading-relaxed">
        {role === 'landlord'
          ? t('account.deleteAccountWarning', {
              orgName: orgName || 'your organisation',
            })
          : t('account.deleteAccountTenantWarning')}
      </p>
      <div>
        <button
          type="button"
          onClick={() => {
            setConfirmText('');
            setDeletePassword('');
            setDeleteError(null);
            setIsDeleteDialogOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-danger-border text-danger-text hover:bg-danger-soft font-medium min-h-tap cursor-pointer transition-colors whitespace-nowrap"
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('account.deleteAccountBtn')}</span>
        </button>
      </div>

      {/* Delete Account Modal Dialog */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="dialog relative w-full max-w-md rounded-lg border border-danger-border bg-surface p-6 shadow-lg space-y-4"
          >
            <h3 id="delete-dialog-title" className="text-lg font-bold text-danger-text">
              {t('account.deleteDialogTitle')}
            </h3>
            <p className="text-sm text-fg-muted">{t('account.deleteDialogWarning')}</p>

            {deleteError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-[var(--danger-soft)] border border-danger-border text-danger-text text-sm font-medium flex items-start gap-2"
              >
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div className="field flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="delete-confirm-text"
                  className="text-sm font-semibold text-fg whitespace-nowrap"
                >
                  {t('account.deleteTypeConfirm')}
                </label>
                <input
                  id="delete-confirm-text"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="h-11 px-3 py-2 rounded-md border border-border bg-surface text-fg text-base focus-visible:outline-2 focus-visible:outline-accent"
                />
              </div>

              <div className="field flex flex-col gap-1.5 min-w-0">
                <label
                  htmlFor="delete-confirm-password"
                  className="text-sm font-semibold text-fg whitespace-nowrap"
                >
                  {t('account.deletePasswordConfirm')}
                </label>
                <PasswordInput
                  id="delete-confirm-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setConfirmText('');
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md border border-border bg-surface text-fg font-medium hover:bg-surface-hover transition-colors whitespace-nowrap cursor-pointer"
              >
                {t('account.cancel')}
              </button>
              <button
                type="button"
                disabled={confirmText !== 'DELETE' || !deletePassword || isDeleting}
                onClick={handleDeleteAccount}
                className="inline-flex items-center justify-center min-h-tap px-4 py-2 rounded-md bg-danger text-danger-fg font-medium hover:bg-danger-hover transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? t('account.deleteDeleting') : t('account.deleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Account Page Root ────────────────────────────────────────────────────────
export default function AccountPage() {
  const { t } = useTranslation();
  const { user, activeOrg, role } = useAuth();

  const subtitle =
    user?.fullName && activeOrg
      ? t('account.subtitle', {
          name: user.fullName,
          role: activeOrg.role,
          orgName: activeOrg.orgName,
        })
      : user?.email || '';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 min-w-0">
      {/* Page Header */}
      <section className="page-head flex flex-col gap-1 min-w-0">
        <h1 className="text-2xl font-bold text-fg break-words">{t('account.title')}</h1>
        <p className="text-sm text-fg-muted break-words">{subtitle}</p>
      </section>

      {/* Main Grid / Layout */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-8 items-start">
        {/* Sticky Desktop Sub-Navigation */}
        <nav
          className="hidden md:flex flex-col gap-1 sticky top-20 text-sm font-semibold"
          aria-label={t('account.navSections')}
        >
          <a
            href="#profile"
            className="flex items-center min-h-tap px-3 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            {t('account.navProfile')}
          </a>
          <a
            href="#password"
            className="flex items-center min-h-tap px-3 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            {t('account.navPassword')}
          </a>
          <a
            href="#sessions"
            className="flex items-center min-h-tap px-3 rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            {t('account.navSessions')}
          </a>
          <a
            href="#delete"
            className="flex items-center min-h-tap px-3 rounded-md text-danger-text hover:bg-danger-soft transition-colors whitespace-nowrap"
          >
            {t('account.navDelete')}
          </a>
        </nav>

        {/* Content Cards */}
        <div className="flex flex-col gap-6 min-w-0">
          <ProfileSection key={user?.id} user={user} />
          <ChangePasswordSection />
          <SessionsSection />
          <DeleteAccountSection role={role} orgName={activeOrg?.orgName} />
        </div>
      </div>
    </div>
  );
}
