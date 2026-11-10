import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Zap,
  CheckCircle,
  AlertCircle,
  FileText,
  Play,
  CheckCheck,
  Building as BuildingIcon,
} from 'lucide-react';
import { useBuildings } from '../../lib/api/buildings.js';
import {
  useBills,
  useReadings,
  useRunBilling,
  useIssueReadyBills,
  useEnterReading,
  useIssueBill,
} from '../../lib/api/billing.js';
import { formatMoney } from '../../lib/format.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { useAuth } from '../../app/auth/AuthContext.js';

export default function BillingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isLandlord = role === 'landlord';

  // State
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'drafts' | 'issued' | 'readings'>('drafts');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Queries
  const { data: buildings = [], isPending: buildingsPending } = useBuildings();

  // Auto-select first building
  const activeBuildingId = selectedBuildingId || (buildings[0]?.id ?? '');

  const {
    data: bills = [],
    isPending: billsPending,
    isError: billsError,
    error: billsErr,
    refetch: refetchBills,
  } = useBills({
    buildingId: activeBuildingId || undefined,
    month: selectedMonth || undefined,
  });

  const {
    data: readings = [],
    isPending: readingsPending,
    isError: readingsError,
    error: readingsErr,
    refetch: refetchReadings,
  } = useReadings(activeBuildingId || undefined, selectedMonth || undefined);

  // Mutations
  const runBilling = useRunBilling();
  const issueReady = useIssueReadyBills();
  const enterReading = useEnterReading();
  const issueBill = useIssueBill();

  // Reading entry form local states
  const [readingInputs, setReadingInputs] = useState<
    Record<string, { reading: string; meterReplaced: boolean; newMeterStart: string }>
  >({});
  const [readingSuccess, setReadingSuccess] = useState<Record<string, boolean>>({});

  const handleRunBilling = async () => {
    if (!activeBuildingId || !selectedMonth) return;
    await runBilling.mutateAsync({
      buildingId: activeBuildingId,
      month: selectedMonth,
    });
  };

  const handleIssueReady = async () => {
    if (!activeBuildingId || !selectedMonth) return;
    await issueReady.mutateAsync({
      buildingId: activeBuildingId,
      month: selectedMonth,
    });
  };

  const handleSaveReading = async (unitId: string) => {
    const input = readingInputs[unitId];
    if (!input || !input.reading) return;

    await enterReading.mutateAsync({
      unitId,
      month: selectedMonth,
      reading: parseInt(input.reading, 10),
      meterReplaced: input.meterReplaced,
      newMeterStart: input.newMeterStart ? parseInt(input.newMeterStart, 10) : undefined,
    });

    setReadingSuccess((prev) => ({ ...prev, [unitId]: true }));
    setTimeout(() => {
      setReadingSuccess((prev) => ({ ...prev, [unitId]: false }));
    }, 3000);
  };

  // Filter bills
  const drafts = bills.filter((b) => b.status === 'draft');
  const readyDraftsCount = drafts.filter((b) => !b.needsReading).length;

  const issuedBills = bills.filter((b) => {
    if (b.status === 'draft') return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'overdue') return b.overdue;
    return b.status === statusFilter;
  });

  if (buildingsPending) {
    return (
      <div data-skeleton aria-busy="true" className="space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg break-words">{t('billing.title')}</h1>
          <p className="text-xs text-fg-muted mt-0.5">
            {t('billing.subtitle', 'Manage drafts, meter readings and issued bills')}
          </p>
        </div>

        {isLandlord && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleRunBilling}
              disabled={runBilling.isPending || !activeBuildingId}
            >
              <Play className="h-4 w-4 mr-1.5" />
              {runBilling.isPending ? t('billing.generating') : t('billing.runGeneration')}
            </button>
            {activeTab === 'drafts' && readyDraftsCount > 0 && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleIssueReady}
                disabled={issueReady.isPending}
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                {issueReady.isPending
                  ? t('billing.issuing')
                  : t('billing.issueReady', { count: readyDraftsCount })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Building & Month pickers */}
      <div className="card p-4 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-semibold text-fg-muted block mb-1">
              {t('billing.buildingPicker')}
            </label>
            <div className="relative">
              <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
              <select
                className="input pl-9 w-full"
                value={activeBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
              >
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full sm:w-44">
            <label className="text-xs font-semibold text-fg-muted block mb-1">
              {t('billing.monthPicker')}
            </label>
            <input
              type="month"
              className="input w-full"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Billing sections"
        className="flex border-b border-border/60 gap-4 text-sm font-medium"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'drafts'}
          type="button"
          className={`pb-2.5 px-1 relative transition-colors ${
            activeTab === 'drafts'
              ? 'text-accent font-semibold border-b-2 border-accent'
              : 'text-fg-muted hover:text-fg'
          }`}
          onClick={() => setActiveTab('drafts')}
        >
          {t('billing.tabs.drafts')}
          {drafts.length > 0 && (
            <span className="ml-2 badge badge--neutral text-xs px-1.5 py-0.2">{drafts.length}</span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'issued'}
          type="button"
          className={`pb-2.5 px-1 relative transition-colors ${
            activeTab === 'issued'
              ? 'text-accent font-semibold border-b-2 border-accent'
              : 'text-fg-muted hover:text-fg'
          }`}
          onClick={() => setActiveTab('issued')}
        >
          {t('billing.tabs.issued')}
          {issuedBills.length > 0 && (
            <span className="ml-2 badge badge--neutral text-xs px-1.5 py-0.2">{issuedBills.length}</span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'readings'}
          type="button"
          className={`pb-2.5 px-1 relative transition-colors ${
            activeTab === 'readings'
              ? 'text-accent font-semibold border-b-2 border-accent'
              : 'text-fg-muted hover:text-fg'
          }`}
          onClick={() => setActiveTab('readings')}
        >
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            {t('billing.tabs.readings')}
          </span>
        </button>
      </div>

      {/* Tab 1: Drafts */}
      {activeTab === 'drafts' && (
        <div className="space-y-4">
          {billsPending ? (
            <div data-skeleton aria-busy="true" className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : billsError ? (
            <ErrorState message={billsErr?.message} onRetry={() => void refetchBills()} />
          ) : drafts.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <FileText className="h-8 w-8 text-fg-muted mx-auto" />
              <p className="font-semibold text-fg">{t('billing.emptyDrafts')}</p>
              {isLandlord && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm mt-2"
                  onClick={handleRunBilling}
                  disabled={runBilling.isPending}
                >
                  {t('billing.runGeneration')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((bill) => (
                <div
                  key={bill.id}
                  className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/l/bills/${bill.id}`)}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg">
                        {t('billing.billFor', {
                          unit: bill.leaseId.slice(0, 8),
                          month: bill.periodMonth.slice(0, 7),
                        })}
                      </span>
                      {bill.needsReading ? (
                        <span className="badge badge--warning text-xs flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {t('billing.needsReading')}
                        </span>
                      ) : (
                        <span className="badge badge--success text-xs flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {t('billing.status.draft')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-fg-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        {t('billing.dueDate')}: {bill.dueDate}
                      </span>
                      <span>{t('billing.linesCount', { count: bill.lines?.length ?? 0 })}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <p className="text-xs text-fg-muted">{t('billing.total')}</p>
                      <p className="font-bold num text-base text-fg">{formatMoney(bill.totalPoisha)}</p>
                    </div>

                    {isLandlord && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={bill.needsReading || issueBill.isPending}
                        onClick={() => issueBill.mutate(bill.id)}
                      >
                        {t('billing.issue')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Issued Bills */}
      {activeTab === 'issued' && (
        <div className="space-y-4">
          <div className="flex gap-2 text-xs overflow-x-auto pb-1">
            {['all', 'issued', 'partially_paid', 'paid', 'overdue'].map((filter) => (
              <button
                key={filter}
                type="button"
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  statusFilter === filter
                    ? 'bg-accent text-accent-fg font-semibold'
                    : 'bg-muted text-fg-muted hover:text-fg'
                }`}
                onClick={() => setStatusFilter(filter)}
              >
                {t(`billing.status.${filter}`, filter)}
              </button>
            ))}
          </div>

          {billsPending ? (
            <div data-skeleton aria-busy="true" className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : billsError ? (
            <ErrorState message={billsErr?.message} onRetry={() => void refetchBills()} />
          ) : issuedBills.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <FileText className="h-8 w-8 text-fg-muted mx-auto" />
              <p className="font-semibold text-fg">{t('billing.emptyIssued')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {issuedBills.map((bill) => (
                <div
                  key={bill.id}
                  className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-accent/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/l/bills/${bill.id}`)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fg">
                        {t('billing.billFor', {
                          unit: bill.leaseId.slice(0, 8),
                          month: bill.periodMonth.slice(0, 7),
                        })}
                      </span>
                      <span
                        className={`badge text-xs capitalize ${
                          bill.status === 'paid'
                            ? 'badge--success'
                            : bill.status === 'partially_paid'
                              ? 'badge--warning'
                              : 'badge--neutral'
                        }`}
                      >
                        {t(`billing.status.${bill.status}`)}
                      </span>
                      {bill.overdue && (
                        <span className="badge badge--danger text-xs">{t('billing.status.overdue')}</span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted">
                      {t('billing.dueDate')}: {bill.dueDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-6 justify-between sm:justify-end text-right">
                    <div>
                      <p className="text-xs text-fg-muted">{t('billing.paid')}</p>
                      <p className="font-medium num text-sm text-fg-muted">{formatMoney(bill.paidPoisha)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-fg-muted">{t('billing.balance')}</p>
                      <p
                        className={`font-bold num text-base ${
                          bill.balancePoisha > 0 ? 'text-accent' : 'text-fg'
                        }`}
                      >
                        {formatMoney(bill.balancePoisha)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Readings Grid */}
      {activeTab === 'readings' && (
        <div className="space-y-4">
          {readingsPending ? (
            <div data-skeleton aria-busy="true" className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : readingsError ? (
            <ErrorState message={readingsErr?.message} onRetry={() => void refetchReadings()} />
          ) : readings.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <Zap className="h-8 w-8 text-fg-muted mx-auto" />
              <p className="font-semibold text-fg">{t('billing.emptyReadings')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-fg-muted border-b border-border">
                    <tr>
                      <th className="p-3">{t('units.label', 'Unit')}</th>
                      <th className="p-3">{t('billing.prevReading')}</th>
                      <th className="p-3 min-w-36">{t('billing.currReading')}</th>
                      <th className="p-3">{t('billing.units')}</th>
                      <th className="p-3 text-right">{t('actions.save', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {readings.map((r) => {
                      const input = readingInputs[r.unitId] ?? {
                        reading: r.reading !== null ? String(r.reading) : '',
                        meterReplaced: r.meterReplaced,
                        newMeterStart:
                          r.newMeterStart !== null && r.newMeterStart !== undefined
                            ? String(r.newMeterStart)
                            : '',
                      };
                      const currNum = parseInt(input.reading, 10);
                      const prevNum = r.prevReading ?? 0;
                      const unitsCalculated =
                        !isNaN(currNum) && currNum >= 0
                          ? input.meterReplaced
                            ? currNum - (parseInt(input.newMeterStart, 10) || 0)
                            : currNum - prevNum
                          : null;

                      return (
                        <tr key={r.unitId} className="hover:bg-muted/20">
                          <td className="p-3 font-semibold text-fg">
                            {r.unitLabel}
                            {r.needsReading && (
                              <span className="block text-xs text-warning">{t('billing.needsReading')}</span>
                            )}
                          </td>
                          <td className="p-3 num text-fg-muted">
                            {r.prevReading != null ? r.prevReading.toLocaleString() : '—'}
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              className="input input--sm w-28 num"
                              placeholder={t('billing.enterReading')}
                              value={input.reading}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReadingInputs((prev) => ({
                                  ...prev,
                                  [r.unitId]: { ...input, reading: val },
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  void handleSaveReading(r.unitId);
                                }
                              }}
                            />
                            {input.meterReplaced && (
                              <div className="mt-1">
                                <input
                                  type="number"
                                  className="input input--sm w-28 num text-xs"
                                  placeholder={t('billing.newMeterStart')}
                                  value={input.newMeterStart}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setReadingInputs((prev) => ({
                                      ...prev,
                                      [r.unitId]: { ...input, newMeterStart: val },
                                    }));
                                  }}
                                />
                              </div>
                            )}
                            <label className="flex items-center gap-1.5 mt-1 text-xs text-fg-muted cursor-pointer">
                              <input
                                type="checkbox"
                                checked={input.meterReplaced}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setReadingInputs((prev) => ({
                                    ...prev,
                                    [r.unitId]: { ...input, meterReplaced: checked },
                                  }));
                                }}
                              />
                              {t('billing.meterReplaced')}
                            </label>
                          </td>
                          <td className="p-3 num font-medium">
                            {unitsCalculated !== null && unitsCalculated >= 0 ? (
                              <span className="text-fg">{unitsCalculated}</span>
                            ) : (
                              <span className="text-fg-muted">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              disabled={enterReading.isPending || !input.reading}
                              onClick={() => handleSaveReading(r.unitId)}
                            >
                              {readingSuccess[r.unitId] ? (
                                <span className="flex items-center gap-1 text-success">
                                  <CheckCircle className="h-4 w-4" />
                                  <span>{t('actions.saved')}</span>
                                </span>
                              ) : (
                                t('actions.save', 'Save')
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
