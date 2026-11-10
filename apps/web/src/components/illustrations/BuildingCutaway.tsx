import type { ReactNode } from 'react';

const c = (name: string) => `var(--illo-${name})`;

export type FlatStatus = 'paid' | 'due' | 'repair' | 'vacant';
export type CutawayFlat = { id: string; status: FlatStatus };

const PILL: Record<FlatStatus, string> = {
  paid: 'bg-success-soft text-success-text',
  due: 'bg-danger-soft text-danger-text',
  repair: 'bg-warning-soft text-warning-text',
  vacant: 'bg-neutral-soft text-fg-secondary',
};

/** Railing under each flat: thin bars drawn with a repeating gradient (token colours only). */
const railing = {
  backgroundImage: `repeating-linear-gradient(90deg, ${c('frame')} 0 2px, transparent 2px 9px)`,
  borderTop: `2px solid ${c('frame')}`,
};

function Roof() {
  return (
    <svg viewBox="0 0 400 64" className="block w-full h-auto" aria-hidden="true" focusable="false">
      <path d="M372 8v44" stroke={c('rail')} strokeWidth="2" />
      <path d="M364 16h16" stroke={c('rail')} strokeWidth="2" />
      <rect
        x="36"
        y="12"
        width="64"
        height="34"
        rx="5"
        fill={c('facade-shade')}
        stroke={c('rail')}
        strokeWidth="2"
      />
      <path d="M46 46v6M90 46v6" stroke={c('rail')} strokeWidth="2" />
      <rect x="250" y="18" width="94" height="34" rx="2" fill={c('facade-shade')} />
      <rect x="284" y="28" width="24" height="24" rx="1" fill={c('window')} />
      <rect x="132" y="40" width="12" height="12" rx="1" fill={c('brick')} />
      <circle cx="138" cy="35" r="9" fill={c('leaf')} />
      <rect x="156" y="42" width="10" height="10" rx="1" fill={c('brick')} />
      <circle cx="161" cy="38" r="7" fill={c('leaf-soft')} />
      <rect x="0" y="52" width="400" height="12" rx="3" fill={c('frame')} />
    </svg>
  );
}

/**
 * A residential building drawn open floor by floor; every flat shows its rent status.
 * With `onSelect` the flats are buttons (landing hero); without it they are decorative (auth panel).
 */
export function BuildingCutaway({
  floors,
  selectedId,
  onSelect,
  statusLabel,
  flatLabel,
  ariaLabel,
  showLevels = true,
}: {
  /** Top floor first; two flats per floor. */
  floors: { level: number; flats: [CutawayFlat, CutawayFlat] }[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  statusLabel: (s: FlatStatus) => string;
  flatLabel: (f: CutawayFlat) => string;
  ariaLabel: string;
  /** Floor numbers to the left of the building (hidden in tight spaces). */
  showLevels?: boolean;
}) {
  const interactive = Boolean(onSelect);

  const renderFlat = (flat: CutawayFlat): ReactNode => {
    const selected = flat.id === selectedId;
    const inner = (
      <>
        <span className="flex items-center justify-between gap-1.5 min-w-0 px-2 pt-2">
          <span
            className={`font-mono text-xs font-semibold whitespace-nowrap ${selected || flat.status === 'vacant' ? 'text-fg' : 'text-illo-ink'}`}
          >
            {flat.id}
          </span>
          <span
            className={`rounded-full px-1.5 py-px text-micro leading-4 font-semibold whitespace-nowrap shrink-0 ${PILL[flat.status]}`}
          >
            {statusLabel(flat.status)}
          </span>
        </span>
        <span className="block h-3 mx-1.5 mt-auto mb-1" style={railing} aria-hidden="true" />
      </>
    );
    const base = `relative flex flex-col min-w-0 min-h-14 rounded-[var(--radius-sm)] text-left transition duration-150 ${
      selected
        ? 'bg-surface shadow-[0_0_0_2px_var(--accent-primary),var(--shadow-md)]'
        : flat.status === 'vacant'
          ? 'bg-[var(--illo-window)]'
          : 'bg-[var(--illo-window-lit)]'
    }`;
    return interactive ? (
      <button
        key={flat.id}
        type="button"
        aria-pressed={selected}
        aria-label={flatLabel(flat)}
        onClick={() => onSelect?.(flat.id)}
        className={`${base} cursor-pointer hover:shadow-[0_0_0_2px_var(--accent-hover)] focus-visible:outline-offset-2`}
      >
        {inner}
      </button>
    ) : (
      <span key={flat.id} className={base}>
        {inner}
      </span>
    );
  };

  return (
    <div role="group" aria-label={ariaLabel} className="relative w-full">
      <Roof />
      <div className="border-r-10 border-[var(--illo-facade-shade)]" style={{ backgroundColor: c('facade') }}>
        {floors.map(({ level, flats }) => (
          <div
            key={level}
            className="relative grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] gap-2 px-2.5 py-2.5 border-b-6 border-[var(--illo-facade-shade)]"
          >
            {showLevels && (
              <span
                className="absolute -left-7 top-1/2 -translate-y-1/2 font-mono text-micro text-fg-muted hidden sm:block"
                aria-hidden="true"
              >
                {level}F
              </span>
            )}
            {renderFlat(flats[0])}
            <span className="flex items-center justify-center" aria-hidden="true">
              <span
                className="block w-3.5 h-8 rounded-[var(--radius-xs)]"
                style={{ backgroundColor: c('window') }}
              />
            </span>
            {renderFlat(flats[1])}
          </div>
        ))}
        {/* ground floor: plaque, gate, caretaker window */}
        <div className="flex items-end justify-between gap-2 px-2.5 pt-3 h-16" aria-hidden="true">
          <span
            className="mb-4 rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-micro whitespace-nowrap"
            style={{ backgroundColor: c('brick'), color: c('facade') }}
          >
            12/B
          </span>
          <span
            className="block w-5/12 h-11 rounded-t-[var(--radius-xs)]"
            style={{
              backgroundColor: c('frame'),
              backgroundImage: `repeating-linear-gradient(90deg, transparent 0 7px, ${c('facade')} 7px 9px)`,
              opacity: 0.95,
            }}
          />
          <span
            className="mb-3 block w-9 h-7 rounded-[var(--radius-xs)]"
            style={{ backgroundColor: c('window-lit') }}
          />
        </div>
      </div>
    </div>
  );
}

/** Sky, sun, clouds, ground and trees that frame the building. Decorative. */
export function SceneBackdrop({ className = '', clouds = true }: { className?: string; clouds?: boolean }) {
  return (
    <svg
      data-layout-ignore

      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMax slice"
      className={`absolute inset-0 w-full h-full ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="600" height="600" fill={c('sky')} />
      <circle cx="300" cy="640" r="420" fill={c('sky-deep')} opacity="0.5" />
      <circle cx="500" cy="96" r="34" fill={c('sun')} />
      {clouds && (
        <g fill={c('cloud')}>
          <rect x="56" y="92" width="104" height="24" rx="12" />
          <rect x="80" y="76" width="50" height="32" rx="16" />
          <rect x="420" y="168" width="86" height="20" rx="10" />
          <rect x="440" y="154" width="40" height="26" rx="13" />
        </g>
      )}
      <rect x="0" y="574" width="600" height="26" fill={c('ground')} />
      <rect x="40" y="506" width="8" height="70" rx="2" fill={c('trunk')} />
      <circle cx="44" cy="494" r="30" fill={c('leaf')} />
      <circle cx="26" cy="516" r="18" fill={c('leaf-soft')} />
      <rect x="552" y="520" width="8" height="56" rx="2" fill={c('trunk')} />
      <circle cx="556" cy="508" r="24" fill={c('leaf-soft')} />
      <circle cx="572" cy="526" r="14" fill={c('leaf')} />
    </svg>
  );
}
