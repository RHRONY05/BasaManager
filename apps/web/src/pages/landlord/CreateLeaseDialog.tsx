import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, AlertCircle, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useCreateLease } from '../../lib/api/leases';
import type { UnitSummary } from '@bm/shared';
import type { LeaseDto } from '@bm/shared/api/leases';

export interface CreateLeaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  units?: UnitSummary[];
  preselectedUnit?: UnitSummary | null;
  onSuccess?: (lease: LeaseDto) => void;
}

interface ChargeRow {
  id: string;
  name: string;
  amount: number;
}

export function CreateLeaseDialog({
  isOpen,
  onClose,
  units = [],
  preselectedUnit,
  onSuccess,
}: CreateLeaseDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const createLeaseMutation = useCreateLease();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [unitId, setUnitId] = useState<string>(preselectedUnit?.id ?? units[0]?.id ?? '');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [monthlyRent, setMonthlyRent] = useState<number | ''>(
    preselectedUnit?.defaultRentPoisha ? Math.round(preselectedUnit.defaultRentPoisha / 100) : 15000,
  );
  const [deposit, setDeposit] = useState<number | ''>(30000);
  const [householdSize, setHouseholdSize] = useState<number>(2);
  const [moveInReading, setMoveInReading] = useState<number | ''>('');
  const [charges, setCharges] = useState<ChargeRow[]>(() => {
    if (preselectedUnit?.charges?.length) {
      return preselectedUnit.charges.map((c, i) => ({
        id: String(i),
        name: c.name,
        amount: Math.round(c.amountPoisha / 100),
      }));
    }
    return [
      { id: '1', name: 'Service charge', amount: 1500 },
      { id: '2', name: 'Water', amount: 500 },
    ];
  });
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedUnit = units.find((u) => u.id === unitId) ?? preselectedUnit;

  const handleUnitChange = (id: string) => {
    setUnitId(id);
    const u = units.find((unit) => unit.id === id);
    if (u) {
      if (u.defaultRentPoisha) {
        setMonthlyRent(Math.round(u.defaultRentPoisha / 100));
      }
      if (u.charges?.length) {
        setCharges(
          u.charges.map((c, i) => ({
            id: String(i),
            name: c.name,
            amount: Math.round(c.amountPoisha / 100),
          })),
        );
      }
    }
  };

  const handleAddCharge = () => {
    setCharges((prev) => [...prev, { id: Date.now().toString(), name: '', amount: 0 }]);
  };

  const handleRemoveCharge = (id: string) => {
    setCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const handleChargeChange = (id: string, field: 'name' | 'amount', value: string | number) => {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const validateStep = (currentStep: number): boolean => {
    setError(null);
    if (currentStep === 1) {
      if (!unitId) {
        setError('Please select a unit');
        return false;
      }
      if (!tenantEmail.trim() || !tenantEmail.includes('@')) {
        setError(t('leases.tenantEmail') + ' is invalid');
        return false;
      }
      if (!tenantName.trim()) {
        setError(t('leases.tenantName') + ' is required');
        return false;
      }
    } else if (currentStep === 2) {
      if (!startDate) {
        setError(t('leases.startDate') + ' is required');
        return false;
      }
      if (monthlyRent === '' || Number(monthlyRent) < 0) {
        setError(t('leases.monthlyRent') + ' must be 0 or greater');
        return false;
      }
      if (deposit === '' || Number(deposit) < 0) {
        setError(t('leases.deposit') + ' must be 0 or greater');
        return false;
      }
    }
    return true;
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (validateStep(step)) {
      setStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev));
    }
  };

  const handleBack = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;

    setError(null);
    try {
      const result = await createLeaseMutation.mutateAsync({
        unitId,
        tenantEmail: tenantEmail.trim().toLowerCase(),
        tenantName: tenantName.trim(),
        startDate,
        monthlyRentPoisha: Math.round(Number(monthlyRent || 0) * 100),
        depositPoisha: Math.round(Number(deposit || 0) * 100),
        householdSize: Number(householdSize || 1),
        moveInReading: moveInReading !== '' ? Number(moveInReading) : undefined,
        charges: charges
          .filter((c) => c.name.trim() && c.amount > 0)
          .map((c) => ({
            name: c.name.trim(),
            amountPoisha: Math.round(Number(c.amount) * 100),
          })),
      });

      onSuccess?.(result);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setError(msg);
    }
  };

  const totalMonthlyCharges = charges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const totalMonthlyEstimate = (Number(monthlyRent) || 0) + totalMonthlyCharges;

  return (
    <div className="scrim flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog w-full max-w-xl">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div>
            <h2 id={titleId} className="dialog__title">
              {t('leases.createLeaseTitle')}
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              {step === 1 && t('leases.step1')}
              {step === 2 && t('leases.step2')}
              {step === 3 && t('leases.step3')}
              {step === 4 && t('leases.step4')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost p-2 min-h-tap min-w-tap"
            aria-label={t('actions.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="flex items-center gap-2 py-2" aria-label="Progress steps">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {error && (
          <div role="alert" className="field-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Unit & Tenant */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="field">
                <label htmlFor="lease-unit" className="label">
                  {t('leases.reviewUnit')}
                </label>
                {units.length > 0 ? (
                  <select
                    id="lease-unit"
                    value={unitId}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    className="select"
                    required
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.label} (Floor {u.floor ?? 1}, {u.type.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="lease-unit"
                    type="text"
                    disabled
                    value={preselectedUnit ? `Unit ${preselectedUnit.label}` : 'Selected unit'}
                    className="input"
                  />
                )}
              </div>

              <div className="field">
                <label htmlFor="lease-tenant-name" className="label">
                  {t('leases.tenantName')}
                </label>
                <input
                  id="lease-tenant-name"
                  type="text"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder={t('leases.tenantNamePlaceholder')}
                  className="input"
                />
              </div>

              <div className="field">
                <label htmlFor="lease-tenant-email" className="label">
                  {t('leases.tenantEmail')}
                </label>
                <input
                  id="lease-tenant-email"
                  type="email"
                  required
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  placeholder={t('leases.tenantEmailPlaceholder')}
                  className="input"
                />
                <p className="hint text-xs">{t('leases.tenantEmailHint')}</p>
              </div>

              <div className="field">
                <label htmlFor="lease-household" className="label">
                  {t('leases.householdSize')}
                </label>
                <input
                  id="lease-household"
                  type="number"
                  min={1}
                  max={20}
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(Math.max(1, Number(e.target.value)))}
                  className="input input--num"
                />
              </div>
            </div>
          )}

          {/* Step 2: Rent & Deposit */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="field">
                <label htmlFor="lease-start-date" className="label">
                  {t('leases.startDate')}
                </label>
                <input
                  id="lease-start-date"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>

              <div className="field">
                <label htmlFor="lease-rent" className="label">
                  {t('leases.monthlyRent')}
                </label>
                <div className="input-group">
                  <span className="input-group__affix">৳</span>
                  <input
                    id="lease-rent"
                    type="number"
                    min={0}
                    required
                    value={monthlyRent}
                    onChange={(e) =>
                      setMonthlyRent(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                    }
                    className="input input--num"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="lease-deposit" className="label">
                  {t('leases.deposit')}
                </label>
                <div className="input-group">
                  <span className="input-group__affix">৳</span>
                  <input
                    id="lease-deposit"
                    type="number"
                    min={0}
                    required
                    value={deposit}
                    onChange={(e) =>
                      setDeposit(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                    }
                    className="input input--num"
                  />
                </div>
                <p className="hint text-xs">{t('leases.depositHint')}</p>
              </div>

              {selectedUnit?.electricityMode === 'submeter' && (
                <div className="field">
                  <label htmlFor="lease-submeter" className="label">
                    {t('leases.moveInReading')}
                  </label>
                  <input
                    id="lease-submeter"
                    type="number"
                    min={0}
                    value={moveInReading}
                    onChange={(e) =>
                      setMoveInReading(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                    }
                    placeholder="0"
                    className="input input--num"
                  />
                  <p className="hint text-xs">{t('leases.moveInReadingHint')}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Fixed Charges */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-fg">{t('leases.chargesTitle')}</h3>
                  <p className="text-xs text-fg-muted">{t('leases.chargesDesc')}</p>
                </div>
                <button type="button" onClick={handleAddCharge} className="btn btn--ghost btn--sm">
                  <Plus className="h-4 w-4 mr-1" />
                  {t('units.addCharge')}
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {charges.map((charge) => (
                  <div key={charge.id} className="charge-row">
                    <input
                      type="text"
                      value={charge.name}
                      onChange={(e) => handleChargeChange(charge.id, 'name', e.target.value)}
                      placeholder={t('units.chargeName')}
                      className="input"
                    />
                    <div className="input-group">
                      <span className="input-group__affix">৳</span>
                      <input
                        type="number"
                        min={0}
                        value={charge.amount || ''}
                        onChange={(e) =>
                          handleChargeChange(charge.id, 'amount', Math.max(0, Number(e.target.value)))
                        }
                        className="input input--num"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCharge(charge.id)}
                      className="btn btn--ghost p-2 min-h-tap min-w-tap"
                      aria-label={t('actions.delete')}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </button>
                  </div>
                ))}
                {charges.length === 0 && (
                  <p className="text-xs text-fg-muted italic">{t('leases.noCharges')}</p>
                )}
              </div>

              <div className="pt-2 border-t border-border flex justify-between text-sm font-semibold">
                <span>{t('leases.reviewCharges')}:</span>
                <span className="num">৳{totalMonthlyCharges.toLocaleString('en-US')}</span>
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div className="space-y-3 text-sm">
              <h3 className="font-semibold text-sm text-fg">{t('leases.reviewTitle')}</h3>
              <div className="p-3 bg-surface border border-border rounded-lg space-y-2">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewTenant')}:</span>
                  <span className="font-semibold">
                    {tenantName} ({tenantEmail})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewUnit')}:</span>
                  <span className="font-semibold">Unit {selectedUnit?.label ?? unitId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewStartDate')}:</span>
                  <span>{startDate}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewRent')}:</span>
                  <span className="font-semibold num">
                    ৳{Number(monthlyRent || 0).toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewDeposit')}:</span>
                  <span className="num font-semibold text-accent">
                    ৳{Number(deposit || 0).toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-fg-muted">{t('leases.reviewCharges')}:</span>
                  <span className="num">৳{totalMonthlyCharges.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between py-1 pt-2 font-bold text-base text-fg">
                  <span>{t('leases.reviewTotalMonthly')}:</span>
                  <span className="num text-accent">৳{totalMonthlyEstimate.toLocaleString('en-US')}</span>
                </div>
              </div>
              <p className="hint text-xs">{t('leases.tenantEmailHint')}</p>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            {step > 1 ? (
              <button
                key="step-btn-back"
                type="button"
                onClick={handleBack}
                className="btn btn--secondary btn--sm"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                {t('actions.back')}
              </button>
            ) : (
              <button
                key="step-btn-cancel"
                type="button"
                onClick={onClose}
                className="btn btn--ghost btn--sm"
              >
                {t('actions.cancel')}
              </button>
            )}

            {step < 4 ? (
              <button
                key="step-btn-next"
                type="button"
                onClick={handleNext}
                className="btn btn--primary btn--sm"
              >
                {t('actions.next')}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </button>
            ) : (
              <button
                key="step-btn-submit"
                type="submit"
                disabled={createLeaseMutation.isPending}
                aria-busy={createLeaseMutation.isPending}
                className="btn btn--primary btn--sm"
              >
                {createLeaseMutation.isPending ? (
                  <>
                    <span className="spinner mr-2" aria-hidden="true" />
                    {t('leases.creating')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    {t('leases.sendInviteBtn')}
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
