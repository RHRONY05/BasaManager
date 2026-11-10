import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MapPin, Pencil, Plus, Home, DoorOpen, ChevronRight, Clock, UserPlus } from 'lucide-react';
import { useBuilding, useBuildingUnits, useUpdateBuilding } from '../../lib/api/buildings';
import { AddBuildingDialog } from './AddBuildingDialog';
import { AddUnitDialog } from './AddUnitDialog';
import { CreateLeaseDialog } from './CreateLeaseDialog';
import { UnitDrawer } from './UnitDrawer';
import { BuildingMap } from '../../components/domain/BuildingMap';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import type { UnitSummary } from '@bm/shared';

type TabKey = 'units' | 'billing' | 'notices' | 'map';

export default function BuildingDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const {
    data: building,
    isPending: isBuildingPending,
    isError: isBuildingError,
    error: buildingError,
    refetch: refetchBuilding,
  } = useBuilding(id);

  const {
    data: units,
    isPending: isUnitsPending,
    isError: isUnitsError,
    error: unitsError,
    refetch: refetchUnits,
  } = useBuildingUnits(id);

  const updateMutation = useUpdateBuilding();

  const [activeTab, setActiveTab] = useState<TabKey>('units');
  const [unitFilter, setUnitFilter] = useState<'all' | 'occupied' | 'notice' | 'vacant'>('all');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [isAddLeaseOpen, setIsAddLeaseOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnitSummary | null>(null);
  const [selectedUnitForLease, setSelectedUnitForLease] = useState<UnitSummary | null>(null);

  // Map location editing
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [isMapEditing, setIsMapEditing] = useState(false);
  const [mapSaveSuccess, setMapSaveSuccess] = useState(false);

  // Billing tab state
  const [billDay, setBillDay] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [graceDays, setGraceDays] = useState<number | null>(null);
  const [lateFeeType, setLateFeeType] = useState<'none' | 'percent' | 'flat' | null>(null);
  const [lateFeeValue, setLateFeeValue] = useState<number | null>(null);
  const [electricityRate, setElectricityRate] = useState<number | null>(null);
  const [billingSaveSuccess, setBillingSaveSuccess] = useState(false);

  const isUnitOccupied = (u: UnitSummary) =>
    !!u.lease && u.lease.status !== 'ended' && u.lease.status !== 'ended_with_dues';

  if (isBuildingError) {
    return (
      <ErrorState
        message={buildingError?.message ?? t('status.error')}
        onRetry={() => void refetchBuilding()}
      />
    );
  }

  if (isBuildingPending || !building) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-5xl min-w-0">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-16 w-28" />
          <Skeleton className="h-16 w-28" />
          <Skeleton className="h-16 w-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const unitCount = building.unitCount ?? 0;
  const occupiedCount = building.occupiedCount ?? 0;
  const noticeCount = building.noticeCount ?? 0;
  const vacantCount = Math.max(0, unitCount - occupiedCount);

  const filteredUnits = (units ?? []).filter((u) => {
    if (unitFilter === 'occupied') return isUnitOccupied(u);
    if (unitFilter === 'notice') return u.lease?.status === 'notice';
    if (unitFilter === 'vacant') return !isUnitOccupied(u);
    return true;
  });

  const formatMoney = (poisha: number) => {
    const bdt = Math.round(poisha / 100);
    return `৳${bdt.toLocaleString('en-US')}`;
  };

  const handleSaveMapLocation = async () => {
    if (mapLat === null || mapLng === null) return;
    try {
      await updateMutation.mutateAsync({
        id: building.id,
        lat: mapLat,
        lng: mapLng,
      });
      setIsMapEditing(false);
      setMapSaveSuccess(true);
      setTimeout(() => setMapSaveSuccess(false), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: building.id,
        billDay: billDay ?? building.billDay,
        dueDay: dueDay ?? building.dueDay,
        graceDays: graceDays ?? building.graceDays,
        lateFeeType: lateFeeType ?? building.lateFeeType,
        lateFeeValue:
          (lateFeeType ?? building.lateFeeType) === 'none'
            ? 0
            : (lateFeeType ?? building.lateFeeType) === 'flat'
              ? Math.round((lateFeeValue ?? building.lateFeeValue / 100) * 100)
              : (lateFeeValue ?? building.lateFeeValue),
        electricityRatePoisha:
          electricityRate !== null ? Math.round(electricityRate * 100) : building.electricityRatePoisha,
      });
      setBillingSaveSuccess(true);
      setTimeout(() => setBillingSaveSuccess(false), 3000);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Link to="/l/buildings" className="hover:text-fg transition-colors">
          {t('headings.buildings')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span aria-current="page" className="text-fg font-medium truncate">
          {building.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-fg-muted font-bold">
            {t('headings.buildingDetail')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-fg truncate">{building.name}</h1>
          <p className="text-sm text-fg-muted flex items-center gap-1.5 truncate">
            <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              {building.address}
              {building.area ? `, ${building.area}` : ''}
              {building.city ? `, ${building.city}` : ''}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditDialogOpen(true)}
            className="btn btn--secondary btn--sm"
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            {t('buildings.editBuilding')}
          </button>
          <button
            type="button"
            onClick={() => setIsAddLeaseOpen(true)}
            className="btn btn--secondary btn--sm"
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            {t('leases.createLease')}
          </button>
          <button type="button" onClick={() => setIsAddUnitOpen(true)} className="btn btn--primary btn--sm">
            <Plus className="h-4 w-4 mr-1.5" />
            {t('units.addUnit')}
          </button>
        </div>
      </div>

      {/* Building Stats Row */}
      <div className="bld-stats p-4 bg-surface border border-border rounded-lg" aria-label="Building summary">
        <div className="bld-stat">
          <span className="text-xs text-fg-muted">{t('buildings.unitsCount')}</span>
          <strong>{unitCount}</strong>
        </div>
        <div className="bld-stat">
          <span className="text-xs text-fg-muted">{t('buildings.occupied')}</span>
          <strong>
            {occupiedCount}{' '}
            <span className="text-xs text-fg-muted font-normal">
              ({unitCount > 0 ? Math.round((occupiedCount / unitCount) * 100) : 0}%)
            </span>
          </strong>
        </div>
        <div className="bld-stat">
          <span className="text-xs text-fg-muted">{t('buildings.vacant')}</span>
          <strong>{vacantCount}</strong>
        </div>
        <div className="bld-stat">
          <span className="text-xs text-fg-muted">{t('buildings.outstanding')}</span>
          <strong className="text-fg">৳0</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="Building sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'units'}
          onClick={() => setActiveTab('units')}
          className="tab"
        >
          {t('buildings.tabs.units')}
          <span className="tab__count">{unitCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'billing'}
          onClick={() => setActiveTab('billing')}
          className="tab"
        >
          {t('buildings.tabs.billing')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notices'}
          onClick={() => setActiveTab('notices')}
          className="tab"
        >
          {t('buildings.tabs.notices')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'map'}
          onClick={() => setActiveTab('map')}
          className="tab"
        >
          {t('buildings.tabs.map')}
        </button>
      </div>

      {/* Tab 1: Units */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="chips" role="group" aria-label="Filter units">
              <button
                type="button"
                onClick={() => setUnitFilter('all')}
                aria-pressed={unitFilter === 'all'}
                className="chip"
              >
                {t('units.filterAll')} {units?.length ?? 0}
              </button>
              <button
                type="button"
                onClick={() => setUnitFilter('occupied')}
                aria-pressed={unitFilter === 'occupied'}
                className="chip"
              >
                {t('units.filterOccupied')} {occupiedCount}
              </button>
              <button
                type="button"
                onClick={() => setUnitFilter('notice')}
                aria-pressed={unitFilter === 'notice'}
                className="chip"
              >
                {t('units.filterNotice')} {noticeCount}
              </button>
              <button
                type="button"
                onClick={() => setUnitFilter('vacant')}
                aria-pressed={unitFilter === 'vacant'}
                className="chip"
              >
                {t('units.filterVacant')} {vacantCount}
              </button>
            </div>

            <span className="text-xs text-fg-muted">
              {t('buildings.billingRules', {
                billDay: building.billDay,
                dueDay: building.dueDay,
              })}
            </span>
          </div>

          {isUnitsError ? (
            <ErrorState
              message={unitsError?.message ?? t('status.error')}
              onRetry={() => void refetchUnits()}
            />
          ) : isUnitsPending ? (
            <div data-skeleton aria-busy="true" className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredUnits.length === 0 ? (
            <EmptyState
              title={t('units.noUnits')}
              description={t('units.addFirstUnit')}
              action={
                <button
                  type="button"
                  onClick={() => setIsAddUnitOpen(true)}
                  className="btn btn--primary btn--sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('units.addUnit')}
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('units.label')}</th>
                    <th>{t('units.floor')}</th>
                    <th>{t('units.type')}</th>
                    <th className="r">{t('units.defaultRent')}</th>
                    <th>{t('units.monthlyCharges')}</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.map((u) => (
                    <tr key={u.id} onClick={() => setSelectedUnit(u)} className="cursor-pointer">
                      <td className="unit-label font-bold text-fg">
                        <button type="button" className="hover:text-accent hover:underline text-left">
                          {u.label}
                        </button>
                      </td>
                      <td className="num">{u.floor != null ? u.floor : '—'}</td>
                      <td className="capitalize">{u.type.replace('_', ' ')}</td>
                      <td className="r num font-semibold">{formatMoney(u.defaultRentPoisha)}</td>
                      <td>
                        <span className="text-xs text-fg-muted">
                          {u.charges?.length
                            ? `${u.charges.length} charges (${formatMoney(
                                u.charges.reduce((acc, c) => acc + c.amountPoisha, 0),
                              )})`
                            : '—'}
                        </span>
                      </td>
                      <td>
                        {u.lease?.status === 'notice' ? (
                          <span className="badge badge--warning">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {t('units.statusNotice')}
                          </span>
                        ) : isUnitOccupied(u) ? (
                          <span className="badge badge--success">
                            <Home className="h-3 w-3" aria-hidden="true" />
                            {t('units.statusOccupied')}
                          </span>
                        ) : (
                          <span className="badge badge--neutral">
                            <DoorOpen className="h-3 w-3" aria-hidden="true" />
                            {t('units.statusVacant')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Billing Settings */}
      {activeTab === 'billing' && (
        <div className="card max-w-xl">
          <div className="card__head">
            <h2 className="card__title">{t('buildings.tabs.billing')}</h2>
          </div>

          {billingSaveSuccess && (
            <div className="p-3 bg-accent-soft text-accent-text text-sm rounded-md font-medium">
              {t('buildings.billingUpdated')}
            </div>
          )}

          <form onSubmit={handleSaveBilling} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="field">
                <label htmlFor="tab-bill-day" className="label text-xs">
                  {t('buildings.billDay')}
                </label>
                <input
                  id="tab-bill-day"
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={billDay ?? building.billDay}
                  onChange={(e) => setBillDay(Number(e.target.value))}
                  className="input input--num"
                />
              </div>

              <div className="field">
                <label htmlFor="tab-due-day" className="label text-xs">
                  {t('buildings.dueDay')}
                </label>
                <input
                  id="tab-due-day"
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={dueDay ?? building.dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  className="input input--num"
                />
              </div>

              <div className="field">
                <label htmlFor="tab-grace-days" className="label text-xs">
                  {t('buildings.graceDays')}
                </label>
                <input
                  id="tab-grace-days"
                  type="number"
                  min={0}
                  max={15}
                  value={graceDays ?? building.graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                  className="input input--num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="tab-late-fee-type" className="label text-xs">
                  {t('buildings.lateFeeType')}
                </label>
                <select
                  id="tab-late-fee-type"
                  value={lateFeeType ?? building.lateFeeType}
                  onChange={(e) => setLateFeeType(e.target.value as 'none' | 'percent' | 'flat')}
                  className="select"
                >
                  <option value="none">None</option>
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Fixed (৳)</option>
                </select>
              </div>

              {(lateFeeType ?? building.lateFeeType) !== 'none' && (
                <div className="field">
                  <label htmlFor="tab-late-fee-val" className="label text-xs">
                    {t('buildings.lateFeeValue')}
                  </label>
                  <input
                    id="tab-late-fee-val"
                    type="number"
                    step={(lateFeeType ?? building.lateFeeType) === 'flat' ? '1' : '0.1'}
                    min={0}
                    value={
                      lateFeeValue ??
                      ((lateFeeType ?? building.lateFeeType) === 'flat'
                        ? building.lateFeeValue / 100
                        : building.lateFeeValue)
                    }
                    onChange={(e) => setLateFeeValue(Number(e.target.value))}
                    className="input input--num"
                  />
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="tab-elec-rate" className="label text-xs">
                {t('buildings.electricityRate')}
              </label>
              <div className="input-group">
                <span className="input-group__affix">৳</span>
                <input
                  id="tab-elec-rate"
                  type="number"
                  step="0.01"
                  min={0}
                  value={
                    electricityRate !== null
                      ? electricityRate
                      : building.electricityRatePoisha
                        ? building.electricityRatePoisha / 100
                        : ''
                  }
                  onChange={(e) => setElectricityRate(Number(e.target.value))}
                  placeholder="9.00"
                  className="input input--num"
                />
              </div>
            </div>

            <div className="p-3 bg-muted rounded-md text-xs text-fg-muted font-medium">
              {t('buildings.billingPreview', {
                billDay: billDay ?? building.billDay,
                dueDay: dueDay ?? building.dueDay,
                lateFeeText:
                  (lateFeeType ?? building.lateFeeType) === 'none'
                    ? t('buildings.lateFeeNone')
                    : (lateFeeType ?? building.lateFeeType) === 'percent'
                      ? t('buildings.lateFeePercent', {
                          value: lateFeeValue ?? building.lateFeeValue,
                          grace: graceDays ?? building.graceDays,
                        })
                      : t('buildings.lateFeeFixed', {
                          value: lateFeeValue ?? building.lateFeeValue / 100,
                          grace: graceDays ?? building.graceDays,
                        }),
              })}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                aria-busy={updateMutation.isPending}
                className="btn btn--primary"
              >
                {updateMutation.isPending && <span className="spinner mr-2" aria-hidden="true" />}
                {t('actions.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Notices */}
      {activeTab === 'notices' && (
        <div className="card">
          <EmptyState
            title={t('buildings.tabs.notices')}
            description="No notices posted yet for this building."
            action={
              <button type="button" className="btn btn--secondary btn--sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Post notice
              </button>
            }
          />
        </div>
      )}

      {/* Tab 4: Map */}
      {activeTab === 'map' && (
        <div className="card space-y-4">
          <div className="card__head">
            <h2 className="card__title">{t('buildings.tabs.map')}</h2>
            <div className="flex items-center gap-2">
              {isMapEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveMapLocation}
                    disabled={updateMutation.isPending}
                    className="btn btn--primary btn--sm"
                  >
                    {t('actions.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapEditing(false)}
                    className="btn btn--secondary btn--sm"
                  >
                    {t('actions.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMapLat(building.lat ?? 22.3569);
                    setMapLng(building.lng ?? 91.7832);
                    setIsMapEditing(true);
                  }}
                  className="btn btn--secondary btn--sm"
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit location
                </button>
              )}
            </div>
          </div>

          {mapSaveSuccess && (
            <div className="p-3 bg-accent-soft text-accent-text text-sm rounded-md font-medium">
              Location saved successfully.
            </div>
          )}

          {isMapEditing && <p className="text-xs text-accent font-medium">{t('buildings.mapClickHint')}</p>}

          <BuildingMap
            lat={isMapEditing ? (mapLat ?? building.lat) : building.lat}
            lng={isMapEditing ? (mapLng ?? building.lng) : building.lng}
            name={building.name}
            editable={isMapEditing}
            onLocationChange={(lat, lng) => {
              setMapLat(lat);
              setMapLng(lng);
            }}
          />
        </div>
      )}

      {/* Modals & Drawers */}
      <AddBuildingDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        building={building}
      />

      <AddUnitDialog
        buildingId={building.id}
        isOpen={isAddUnitOpen}
        onClose={() => setIsAddUnitOpen(false)}
      />

      {isAddLeaseOpen && (
        <CreateLeaseDialog
          isOpen={isAddLeaseOpen}
          onClose={() => {
            setIsAddLeaseOpen(false);
            setSelectedUnitForLease(null);
          }}
          preselectedUnit={selectedUnitForLease}
          units={units?.filter(
            (u) => !u.lease || u.lease.status === 'ended' || u.lease.status === 'ended_with_dues',
          )}
          onSuccess={() => {
            setIsAddLeaseOpen(false);
            setSelectedUnitForLease(null);
            void refetchUnits();
            void refetchBuilding();
          }}
        />
      )}

      {selectedUnit && (
        <UnitDrawer
          key={selectedUnit.id}
          buildingId={building.id}
          buildingName={building.name}
          unit={selectedUnit}
          isOpen={!!selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onAddLease={() => {
            setSelectedUnitForLease(selectedUnit);
            setSelectedUnit(null);
            setIsAddLeaseOpen(true);
          }}
        />
      )}
    </div>
  );
}
