import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle } from 'lucide-react';
import { useCreateBuilding, useUpdateBuilding } from '../../lib/api/buildings';
import type { Building } from '@bm/shared';

export interface AddBuildingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  building?: Building | null;
}

export function AddBuildingDialog({ isOpen, onClose, building }: AddBuildingDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const createMutation = useCreateBuilding();
  const updateMutation = useUpdateBuilding();

  const isEditing = !!building;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState(building?.name ?? '');
  const [address, setAddress] = useState(building?.address ?? '');
  const [area, setArea] = useState(building?.area ?? '');
  const [city, setCity] = useState(building?.city ?? 'Chattogram');
  const [billDay, setBillDay] = useState(building?.billDay ?? 1);
  const [dueDay, setDueDay] = useState(building?.dueDay ?? 10);
  const [graceDays, setGraceDays] = useState(building?.graceDays ?? 0);
  const [lateFeeType, setLateFeeType] = useState<'none' | 'percent' | 'flat'>(
    building?.lateFeeType ?? 'none',
  );
  const [lateFeeValue, setLateFeeValue] = useState(
    building?.lateFeeType === 'flat' ? (building.lateFeeValue ?? 0) / 100 : (building?.lateFeeValue ?? 0),
  );
  const [electricityRate, setElectricityRate] = useState(
    building?.electricityRatePoisha ? building.electricityRatePoisha / 100 : 0,
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const getLateFeePreview = () => {
    if (lateFeeType === 'none') {
      return t('buildings.lateFeeNone');
    }
    if (lateFeeType === 'percent') {
      return t('buildings.lateFeePercent', { value: lateFeeValue, grace: graceDays });
    }
    return t('buildings.lateFeeFixed', { value: lateFeeValue, grace: graceDays });
  };

  const previewString = t('buildings.billingPreview', {
    billDay,
    dueDay,
    lateFeeText: getLateFeePreview(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('buildings.name') + ' is required');
      return;
    }
    if (!address.trim()) {
      setError(t('buildings.address') + ' is required');
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        area: area.trim() || 'Central',
        city: city.trim() || 'Chattogram',
        billDay: Number(billDay),
        dueDay: Number(dueDay),
        graceDays: Number(graceDays),
        lateFeeType,
        lateFeeValue:
          lateFeeType === 'none'
            ? 0
            : lateFeeType === 'flat'
              ? Math.round(Number(lateFeeValue) * 100)
              : Number(lateFeeValue),
        electricityRatePoisha: electricityRate ? Math.round(Number(electricityRate) * 100) : 0,
      };

      if (isEditing && building) {
        await updateMutation.mutateAsync({ id: building.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('status.error');
      setError(msg);
    }
  };

  return (
    <div className="scrim flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog w-full max-w-lg">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h2 id={titleId} className="dialog__title">
            {isEditing ? t('buildings.editBuilding') : t('buildings.addBuilding')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost p-2 min-h-tap min-w-tap"
            aria-label={t('actions.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="field-error">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="field">
            <label htmlFor="bld-name" className="label">
              {t('buildings.name')}
            </label>
            <input
              id="bld-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('buildings.namePlaceholder')}
              className="input"
            />
          </div>

          <div className="field">
            <label htmlFor="bld-address" className="label">
              {t('buildings.address')}
            </label>
            <input
              id="bld-address"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('buildings.addressPlaceholder')}
              className="input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="bld-area" className="label">
                {t('buildings.area')}
              </label>
              <input
                id="bld-area"
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={t('buildings.areaPlaceholder')}
                className="input"
              />
            </div>
            <div className="field">
              <label htmlFor="bld-city" className="label">
                {t('buildings.city')}
              </label>
              <input
                id="bld-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('buildings.cityPlaceholder')}
                className="input"
              />
            </div>
          </div>

          <div className="divider" />

          {/* Billing Settings Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">{t('buildings.tabs.billing')}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="field">
                <label htmlFor="bld-bill-day" className="label text-xs">
                  {t('buildings.billDay')}
                </label>
                <input
                  id="bld-bill-day"
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={billDay}
                  onChange={(e) => setBillDay(Number(e.target.value))}
                  className="input input--num"
                />
              </div>

              <div className="field">
                <label htmlFor="bld-due-day" className="label text-xs">
                  {t('buildings.dueDay')}
                </label>
                <input
                  id="bld-due-day"
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="input input--num"
                />
              </div>

              <div className="field">
                <label htmlFor="bld-grace" className="label text-xs">
                  {t('buildings.graceDays')}
                </label>
                <input
                  id="bld-grace"
                  type="number"
                  min={0}
                  max={30}
                  value={graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                  className="input input--num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="bld-late-fee-type" className="label text-xs">
                  {t('buildings.lateFeeType')}
                </label>
                <select
                  id="bld-late-fee-type"
                  value={lateFeeType}
                  onChange={(e) => setLateFeeType(e.target.value as 'none' | 'percent' | 'flat')}
                  className="select"
                >
                  <option value="none">None</option>
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Fixed (৳)</option>
                </select>
              </div>

              {lateFeeType !== 'none' && (
                <div className="field">
                  <label htmlFor="bld-late-fee-val" className="label text-xs">
                    {t('buildings.lateFeeValue')}
                  </label>
                  <input
                    id="bld-late-fee-val"
                    type="number"
                    step={lateFeeType === 'flat' ? '1' : '0.1'}
                    min={0}
                    value={lateFeeValue}
                    onChange={(e) => setLateFeeValue(Number(e.target.value))}
                    className="input input--num"
                  />
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="bld-elec-rate" className="label text-xs">
                {t('buildings.electricityRate')}
              </label>
              <div className="input-group">
                <span className="input-group__affix">৳</span>
                <input
                  id="bld-elec-rate"
                  type="number"
                  step="0.01"
                  min={0}
                  value={electricityRate || ''}
                  onChange={(e) => setElectricityRate(Number(e.target.value))}
                  placeholder="9.00"
                  className="input input--num"
                />
              </div>
            </div>

            <div className="p-3 bg-muted rounded-md text-xs text-fg-muted font-medium">{previewString}</div>
          </div>

          <div className="dialog__actions pt-3 border-t border-border">
            <button type="button" onClick={onClose} disabled={isPending} className="btn btn--secondary">
              {t('actions.cancel')}
            </button>
            <button type="submit" disabled={isPending} aria-busy={isPending} className="btn btn--primary">
              {isPending && <span className="spinner mr-2" aria-hidden="true" />}
              {isEditing ? t('actions.save') : t('buildings.createBuilding')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
