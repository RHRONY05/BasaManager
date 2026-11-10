import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, Home, DoorOpen, AlertCircle, FileText, ArrowRight } from 'lucide-react';
import { useUpdateUnit, useArchiveUnit } from '../../lib/api/buildings';
import type { UnitSummary, UnitCharge } from '@bm/shared';

export interface UnitDrawerProps {
  buildingId: string;
  buildingName: string;
  unit: UnitSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onAddLease?: () => void;
}

export function UnitDrawer({ buildingId, buildingName, unit, isOpen, onClose, onAddLease }: UnitDrawerProps) {
  const { t } = useTranslation();
  const updateMutation = useUpdateUnit(buildingId);
  const archiveMutation = useArchiveUnit(buildingId);

  const [charges, setCharges] = useState<UnitCharge[]>(() => unit?.charges ?? []);
  const [error, setError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  if (!isOpen || !unit) return null;

  const isPending = updateMutation.isPending || archiveMutation.isPending;
  const isOccupied = !!unit.lease && unit.lease.status !== 'ended' && unit.lease.status !== 'ended_with_dues';

  const handleAddCharge = () => {
    setCharges((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        name: '',
        amountPoisha: 0,
      },
    ]);
  };

  const handleRemoveCharge = (index: number) => {
    setCharges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChargeChange = (index: number, field: 'name' | 'amountPoisha', value: string | number) => {
    setCharges((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const handleSaveCharges = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: unit.id,
        charges: charges
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            amountPoisha: Number(c.amountPoisha),
          })),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setError(msg);
    }
  };

  const handleArchive = async () => {
    setError(null);
    try {
      await archiveMutation.mutateAsync(unit.id);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setError(msg);
    }
  };

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true">
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer">
        <header className="drawer__head">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-fg-muted font-medium">
              {buildingName} · Floor {unit.floor ?? 1}
            </p>
            <h2 className="text-xl font-bold text-fg truncate">Unit {unit.label}</h2>
            <div className="mt-1">
              {isOccupied ? (
                <span className="badge badge--success">
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('units.activeLease')}
                </span>
              ) : (
                <span className="badge badge--neutral">
                  <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('units.statusVacant')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost p-2 min-h-tap min-w-tap"
            aria-label={t('actions.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="drawer__body space-y-6">
          {error && (
            <div role="alert" className="field-error">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Unit Details Grid */}
          <dl className="dl dl--grid">
            <div className="dl__row">
              <dt>{t('units.type')}</dt>
              <dd className="capitalize">{unit.type.replace('_', ' ')}</dd>
            </div>
            <div className="dl__row">
              <dt>{t('units.defaultRent')}</dt>
              <dd className="num">{formatMoney(unit.defaultRentPoisha)}</dd>
            </div>
            <div className="dl__row">
              <dt>{t('units.electricityMode')}</dt>
              <dd className="capitalize">{unit.electricityMode}</dd>
            </div>
            <div className="dl__row">
              <dt>{t('units.floor')}</dt>
              <dd className="num">{unit.floor ?? 1}</dd>
            </div>
          </dl>

          <div className="divider" />

          {/* Monthly Charges Editor */}
          <section className="space-y-3" aria-labelledby="drawer-charges-h">
            <div className="flex items-center justify-between">
              <h3 id="drawer-charges-h" className="font-semibold text-sm text-fg">
                {t('units.monthlyCharges')}
              </h3>
              <button type="button" onClick={handleAddCharge} className="btn btn--ghost btn--sm">
                <Plus className="h-4 w-4 mr-1" />
                {t('units.addCharge')}
              </button>
            </div>

            <div className="space-y-2">
              {charges.map((charge, idx) => (
                <div key={charge.id ?? idx} className="charge-row">
                  <input
                    type="text"
                    value={charge.name}
                    onChange={(e) => handleChargeChange(idx, 'name', e.target.value)}
                    placeholder={t('units.chargeName')}
                    className="input"
                    aria-label={t('units.chargeName')}
                  />
                  <div className="input-group">
                    <span className="input-group__affix">৳</span>
                    <input
                      type="number"
                      min={0}
                      value={Math.round(charge.amountPoisha / 100) || ''}
                      onChange={(e) =>
                        handleChargeChange(idx, 'amountPoisha', Math.round(Number(e.target.value) * 100))
                      }
                      placeholder="1000"
                      className="input input--num"
                      aria-label={t('units.chargeAmount')}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCharge(idx)}
                    className="btn btn--ghost p-2 min-h-tap min-w-tap"
                    aria-label={t('actions.delete')}
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </button>
                </div>
              ))}
              {charges.length === 0 && (
                <p className="text-xs text-fg-muted italic">No recurring charges defined.</p>
              )}
            </div>
            <p className="hint text-xs">{t('units.chargesHint')}</p>
          </section>

          <div className="divider" />

          {/* Current Lease Summary / Vacant Action */}
          <section className="card card--tight">
            <div className="card__head flex items-center justify-between">
              <h3 className="font-semibold text-sm text-fg">{t('units.currentLease')}</h3>
              {isOccupied && unit.lease && (
                <span className="badge badge--success text-xs capitalize">{unit.lease.status}</span>
              )}
            </div>
            {isOccupied && unit.lease ? (
              <div className="p-4 space-y-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-fg-muted">{t('leases.monthlyRent')}:</span>
                    <span className="num font-bold">
                      {formatMoney(unit.lease.monthlyRentPoisha ?? unit.defaultRentPoisha)}
                    </span>
                  </div>
                  {unit.lease.tenantName ? (
                    <div className="flex justify-between">
                      <span className="text-fg-muted">{t('leases.tenants')}:</span>
                      <span className="font-medium text-fg">{unit.lease.tenantName}</span>
                    </div>
                  ) : null}
                </div>
                {unit.lease.id && (
                  <Link to={`/l/leases/${unit.lease.id}`} className="btn btn--secondary btn--sm w-full">
                    <FileText className="h-4 w-4 mr-1.5" />
                    {t('leases.openLease')}
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Link>
                )}
              </div>
            ) : (
              <div className="p-4 py-3 text-center space-y-3">
                <p className="text-sm text-fg-muted">
                  {t('units.statusVacant')} — unit is ready for leasing.
                </p>
                <button type="button" onClick={onAddLease} className="btn btn--primary btn--sm w-full">
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('leases.createLease')}
                </button>
              </div>
            )}
          </section>

          {/* Archive unit section */}
          {!isOccupied && (
            <div className="pt-2">
              {!showArchiveConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(true)}
                  className="btn btn--danger-ghost btn--sm w-full"
                >
                  {t('units.archiveUnit')}
                </button>
              ) : (
                <div className="p-3 border border-danger/30 rounded-lg space-y-3 bg-muted/20">
                  <p className="text-xs text-danger font-medium">
                    {t('units.archiveConfirm', { label: unit.label })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleArchive}
                      className="btn btn--danger btn--sm flex-1"
                    >
                      {t('actions.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowArchiveConfirm(false)}
                      className="btn btn--secondary btn--sm flex-1"
                    >
                      {t('actions.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="drawer__foot">
          <button
            type="button"
            onClick={handleSaveCharges}
            disabled={isPending}
            aria-busy={isPending}
            className="btn btn--primary"
          >
            {isPending && <span className="spinner mr-2" aria-hidden="true" />}
            {t('units.saveCharges')}
          </button>
          <button type="button" onClick={onClose} disabled={isPending} className="btn btn--ghost">
            {t('actions.cancel')}
          </button>
        </footer>
      </aside>
    </div>
  );
}
