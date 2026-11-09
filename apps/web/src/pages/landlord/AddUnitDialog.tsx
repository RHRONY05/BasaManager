import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useCreateUnit } from '../../lib/api/buildings';

export interface AddUnitDialogProps {
  buildingId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ChargeInput {
  id: string;
  name: string;
  amount: number;
}

export function AddUnitDialog({ buildingId, isOpen, onClose }: AddUnitDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const createUnitMutation = useCreateUnit(buildingId);

  const [label, setLabel] = useState('');
  const [floor, setFloor] = useState<number>(1);
  const [type, setType] = useState<'family_flat' | 'bachelor_flat' | 'room' | 'shop'>('family_flat');
  const [defaultRent, setDefaultRent] = useState<number | ''>(12000);
  const [electricityMode, setElectricityMode] = useState<'none' | 'prepaid' | 'submeter'>('submeter');
  const [charges, setCharges] = useState<ChargeInput[]>([
    { id: '1', name: 'Service charge', amount: 1500 },
    { id: '2', name: 'Gas (double burner)', amount: 1080 },
    { id: '3', name: 'Water', amount: 500 },
  ]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddCharge = () => {
    setCharges((prev) => [...prev, { id: Date.now().toString(), name: '', amount: 0 }]);
  };

  const handleRemoveCharge = (id: string) => {
    setCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const handleChargeChange = (id: string, field: 'name' | 'amount', value: string | number) => {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!label.trim()) {
      setError(t('units.label') + ' is required');
      return;
    }

    try {
      await createUnitMutation.mutateAsync({
        label: label.trim(),
        floor: Number(floor),
        type,
        defaultRentPoisha: defaultRent ? Math.round(Number(defaultRent) * 100) : 0,
        electricityMode,
        charges: charges
          .filter((c) => c.name.trim() && c.amount > 0)
          .map((c) => ({
            name: c.name.trim(),
            amountPoisha: Math.round(Number(c.amount) * 100),
          })),
      });
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
            {t('units.addUnit')}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="unit-label" className="label">
                {t('units.label')}
              </label>
              <input
                id="unit-label"
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('units.labelPlaceholder')}
                className="input"
              />
            </div>

            <div className="field">
              <label htmlFor="unit-floor" className="label">
                {t('units.floor')}
              </label>
              <input
                id="unit-floor"
                type="number"
                value={floor}
                onChange={(e) => setFloor(Number(e.target.value))}
                placeholder={t('units.floorPlaceholder')}
                className="input input--num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="unit-type" className="label">
                {t('units.type')}
              </label>
              <select
                id="unit-type"
                value={type}
                onChange={(e) => setType(e.target.value as 'family_flat' | 'bachelor_flat' | 'room' | 'shop')}
                className="select"
              >
                <option value="family_flat">{t('units.types.flat')}</option>
                <option value="bachelor_flat">{t('units.types.bachelor_flat')}</option>
                <option value="room">{t('units.types.room')}</option>
                <option value="shop">{t('units.types.shop')}</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="unit-rent" className="label">
                {t('units.defaultRent')}
              </label>
              <div className="input-group">
                <span className="input-group__affix">৳</span>
                <input
                  id="unit-rent"
                  type="number"
                  min={0}
                  value={defaultRent}
                  onChange={(e) => setDefaultRent(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="12000"
                  className="input input--num"
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="unit-elec" className="label">
              {t('units.electricityMode')}
            </label>
            <select
              id="unit-elec"
              value={electricityMode}
              onChange={(e) => setElectricityMode(e.target.value as 'none' | 'prepaid' | 'submeter')}
              className="select"
            >
              <option value="submeter">{t('units.electricityModes.submeter')}</option>
              <option value="prepaid">{t('units.electricityModes.prepaid')}</option>
              <option value="none">{t('units.electricityModes.included')}</option>
            </select>
          </div>

          {/* Charges section */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">{t('units.monthlyCharges')}</h3>
              <button type="button" onClick={handleAddCharge} className="btn btn--ghost btn--sm">
                <Plus className="h-4 w-4 mr-1" />
                {t('units.addCharge')}
              </button>
            </div>

            <div className="space-y-2">
              {charges.map((charge) => (
                <div key={charge.id} className="charge-row">
                  <input
                    type="text"
                    value={charge.name}
                    onChange={(e) => handleChargeChange(charge.id, 'name', e.target.value)}
                    placeholder={t('units.chargeName')}
                    className="input"
                    aria-label={t('units.chargeName')}
                  />
                  <div className="input-group">
                    <span className="input-group__affix">৳</span>
                    <input
                      type="number"
                      min={0}
                      value={charge.amount || ''}
                      onChange={(e) => handleChargeChange(charge.id, 'amount', Number(e.target.value))}
                      placeholder="1000"
                      className="input input--num"
                      aria-label={t('units.chargeAmount')}
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
            </div>
            <p className="hint text-xs">{t('units.chargesHint')}</p>
          </div>

          <div className="dialog__actions pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={createUnitMutation.isPending}
              className="btn btn--secondary"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={createUnitMutation.isPending}
              aria-busy={createUnitMutation.isPending}
              className="btn btn--primary"
            >
              {createUnitMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
              {t('units.addUnit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
