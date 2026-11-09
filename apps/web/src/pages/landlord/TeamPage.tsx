import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Building2, Trash2, Pencil, X, Mail, AlertCircle, Clock } from 'lucide-react';
import {
  useOrgMembers,
  useOrgInvites,
  useInviteCaretaker,
  useUpdateCaretakerBuildings,
  useRemoveMember,
  useRevokeInvite,
} from '../../lib/api/org';
import { useBuildings } from '../../lib/api/buildings';
import { useAuth } from '../../app/auth/AuthContext';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import type { OrgMember } from '@bm/shared';

export default function TeamPage() {
  const { t } = useTranslation();
  const { activeOrg } = useAuth();

  const {
    data: members,
    isPending: isMembersPending,
    isError: isMembersError,
    error: membersError,
    refetch: refetchMembers,
  } = useOrgMembers();

  const { data: invites, isPending: isInvitesPending } = useOrgInvites();

  const { data: buildings } = useBuildings();

  const inviteMutation = useInviteCaretaker();
  const updateBuildingsMutation = useUpdateCaretakerBuildings();
  const removeMemberMutation = useRemoveMember();
  const revokeInviteMutation = useRevokeInvite();

  // Dialog state
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit buildings dialog
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
  const [editBuildingIds, setEditBuildingIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Remove confirmation
  const [removingMember, setRemovingMember] = useState<OrgMember | null>(null);

  const caretakers = (members ?? []).filter((m) => m.role === 'caretaker');
  const caretakerInvites = (invites ?? []).filter((i) => i.role === 'caretaker');

  const handleOpenInvite = () => {
    setInviteEmail('');
    setSelectedBuildingIds([]);
    setInviteError(null);
    setIsInviteDialogOpen(true);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    if (!inviteEmail.trim()) {
      setInviteError(t('team.emailLabel') + ' is required');
      return;
    }

    try {
      await inviteMutation.mutateAsync({
        email: inviteEmail.trim(),
        role: 'caretaker',
        buildingIds: selectedBuildingIds,
      });
      setIsInviteDialogOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setInviteError(msg);
    }
  };

  const handleOpenEditBuildings = (member: OrgMember) => {
    setEditingMember(member);
    setEditBuildingIds(member.buildingIds ?? []);
    setEditError(null);
  };

  const handleSaveBuildingAssignments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setEditError(null);

    try {
      await updateBuildingsMutation.mutateAsync({
        membershipId: editingMember.id,
        data: {
          buildingIds: editBuildingIds,
        },
      });
      setEditingMember(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setEditError(msg);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removingMember) return;
    try {
      await removeMemberMutation.mutateAsync(removingMember.id);
      setRemovingMember(null);
    } catch {
      // Handled by mutation
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInviteMutation.mutateAsync(inviteId);
    } catch {
      // Handled by mutation
    }
  };

  return (
    <div className="space-y-8 max-w-5xl min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg break-words">{t('headings.team')}</h1>
          <p className="text-sm text-fg-muted">{t('team.subtitle')}</p>
        </div>
        <button type="button" onClick={handleOpenInvite} className="btn btn--primary">
          <UserPlus className="h-4 w-4 mr-1.5" />
          {t('team.inviteCaretaker')}
        </button>
      </div>

      {/* Caretakers section */}
      <section className="space-y-4" aria-labelledby="caretakers-heading">
        <h2 id="caretakers-heading" className="text-lg font-bold text-fg">
          {t('team.caretakers')}
        </h2>

        {isMembersError ? (
          <ErrorState
            message={membersError?.message ?? t('status.error')}
            onRetry={() => void refetchMembers()}
          />
        ) : isMembersPending ? (
          <div data-skeleton aria-busy="true" className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : caretakers.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-fg-muted">{t('team.noCaretakers')}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Caretaker</th>
                  <th>{t('team.assignedBuildings')}</th>
                  <th className="r">{t('actions.cancel')}</th>
                </tr>
              </thead>
              <tbody>
                {caretakers.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-stack">
                        <span className="font-semibold text-fg">{m.user?.fullName ?? 'Caretaker'}</span>
                        <span className="cell-meta">{m.user?.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.buildingIds && m.buildingIds.length > 0 ? (
                          m.buildingIds.map((bId) => {
                            const b = buildings?.find((x) => x.id === bId);
                            return (
                              <span key={bId} className="badge badge--info text-xs">
                                <Building2 className="h-3 w-3 mr-1" aria-hidden="true" />
                                {b?.name ?? 'Building'}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-xs text-fg-muted italic">
                            {t('team.noBuildingsAssigned')}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditBuildings(m)}
                          className="btn btn--ghost btn--sm p-1 ml-1"
                          aria-label={t('team.editBuildings')}
                        >
                          <Pencil className="h-3.5 w-3.5 text-accent" />
                        </button>
                      </div>
                    </td>
                    <td className="r">
                      <button
                        type="button"
                        onClick={() => setRemovingMember(m)}
                        className="btn btn--danger-ghost btn--sm"
                        aria-label={t('team.removeMember')}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {t('actions.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pending Invites section */}
      <section className="space-y-4" aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="text-lg font-bold text-fg">
          {t('team.openInvites')}
        </h2>

        {isInvitesPending ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : caretakerInvites.length === 0 ? (
          <div className="card p-4 text-center">
            <p className="text-xs text-fg-muted">{t('team.noPendingInvites')}</p>
          </div>
        ) : (
          <div className="list">
            {caretakerInvites.map((inv) => (
              <div key={inv.id} className="list-row justify-between">
                <div className="list-row__main">
                  <span className="list-row__title flex items-center gap-2">
                    <Mail className="h-4 w-4 text-fg-muted shrink-0" />
                    {inv.email}
                  </span>
                  <span className="list-row__meta flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-fg-muted" />
                    {t('team.invitedOn', {
                      date: new Date(inv.createdAt).toLocaleDateString(),
                    })}
                    {inv.buildingIds?.length ? ` · ${inv.buildingIds.length} buildings assigned` : ''}
                  </span>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(inv.id)}
                    disabled={revokeInviteMutation.isPending}
                    className="btn btn--danger-ghost btn--sm"
                  >
                    {t('team.revokeInvite')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Invite Caretaker Dialog */}
      {isInviteDialogOpen && (
        <div className="scrim flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-dialog-title"
            className="dialog w-full max-w-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="invite-dialog-title" className="dialog__title">
                {t('team.inviteTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setIsInviteDialogOpen(false)}
                className="btn btn--ghost p-2 min-h-tap min-w-tap"
                aria-label={t('actions.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteError && (
              <div role="alert" className="field-error">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div className="field">
                <label htmlFor="invite-email" className="label">
                  {t('team.emailLabel')}
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('team.emailPlaceholder')}
                  className="input"
                />
              </div>

              <div className="space-y-2">
                <label className="label">{t('team.assignedBuildings')}</label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-muted/40 border border-border rounded-md">
                  {buildings?.map((b) => {
                    const isChecked = selectedBuildingIds.includes(b.id);
                    return (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer text-sm text-fg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBuildingIds((prev) => [...prev, b.id]);
                            } else {
                              setSelectedBuildingIds((prev) => prev.filter((id) => id !== b.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="font-medium">{b.name}</span>
                        <span className="text-xs text-fg-muted truncate">({b.address})</span>
                      </label>
                    );
                  })}
                  {(!buildings || buildings.length === 0) && (
                    <p className="text-xs text-fg-muted">No buildings available.</p>
                  )}
                </div>
              </div>

              <div className="dialog__actions pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsInviteDialogOpen(false)}
                  disabled={inviteMutation.isPending}
                  className="btn btn--secondary"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  aria-busy={inviteMutation.isPending}
                  className="btn btn--primary"
                >
                  {inviteMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
                  {t('team.sendInvite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Buildings Dialog */}
      {editingMember && (
        <div className="scrim flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-bld-title"
            className="dialog w-full max-w-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="edit-bld-title" className="dialog__title">
                {t('team.editBuildingsTitle', {
                  name: editingMember.user?.fullName ?? 'Caretaker',
                })}
              </h2>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="btn btn--ghost p-2 min-h-tap min-w-tap"
                aria-label={t('actions.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div role="alert" className="field-error">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveBuildingAssignments} className="space-y-4">
              <div className="space-y-2">
                <label className="label">{t('team.assignedBuildings')}</label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-muted/40 border border-border rounded-md">
                  {buildings?.map((b) => {
                    const isChecked = editBuildingIds.includes(b.id);
                    return (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer text-sm text-fg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditBuildingIds((prev) => [...prev, b.id]);
                            } else {
                              setEditBuildingIds((prev) => prev.filter((id) => id !== b.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="font-medium">{b.name}</span>
                        <span className="text-xs text-fg-muted truncate">({b.address})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="dialog__actions pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  disabled={updateBuildingsMutation.isPending}
                  className="btn btn--secondary"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updateBuildingsMutation.isPending}
                  aria-busy={updateBuildingsMutation.isPending}
                  className="btn btn--primary"
                >
                  {updateBuildingsMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
                  {t('team.saveAssignments')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Caretaker Confirmation Dialog */}
      {removingMember && (
        <div className="scrim flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-dialog-title"
            className="dialog w-full max-w-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 id="remove-dialog-title" className="dialog__title text-danger">
                {t('team.removeMember')}
              </h2>
              <button
                type="button"
                onClick={() => setRemovingMember(null)}
                className="btn btn--ghost p-2 min-h-tap min-w-tap"
                aria-label={t('actions.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-fg">
              {t('team.removeConfirm', {
                name: removingMember.user?.fullName ?? 'Caretaker',
                orgName: activeOrg?.orgName ?? 'organisation',
              })}
            </p>

            <div className="dialog__actions pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setRemovingMember(null)}
                disabled={removeMemberMutation.isPending}
                className="btn btn--secondary"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removeMemberMutation.isPending}
                aria-busy={removeMemberMutation.isPending}
                className="btn btn--danger"
              >
                {removeMemberMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
                {t('actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
