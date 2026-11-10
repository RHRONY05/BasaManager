const c = (name: string) => `var(--illo-${name})`;

/** An electricity meter showing this month's reading. Decorative. */
export function MeterArt({ reading, className = '' }: { reading: string; className?: string }) {
  return (
    <svg viewBox="0 0 180 210" className={className} aria-hidden="true" focusable="false">
      <path d="M70 186v24M90 186v24M110 186v24" stroke={c('rail')} strokeWidth="5" strokeLinecap="round" />
      <rect
        x="14"
        y="8"
        width="152"
        height="180"
        rx="18"
        fill={c('facade')}
        stroke={c('rail')}
        strokeWidth="3"
      />
      <rect x="30" y="26" width="120" height="14" rx="7" fill={c('facade-shade')} />
      <rect x="30" y="54" width="120" height="46" rx="8" fill={c('frame')} />
      <text
        x="90"
        y="86"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="26"
        fontWeight="700"
        letterSpacing="3"
        fill={c('window-lit')}
      >
        {reading}
      </text>
      <text
        x="138"
        y="118"
        textAnchor="end"
        fontFamily="ui-monospace, monospace"
        fontSize="12"
        fill={c('rail')}
      >
        kWh
      </text>
      <circle cx="90" cy="150" r="22" fill={c('facade-shade')} stroke={c('rail')} strokeWidth="2" />
      <path d="M90 150l12-10" stroke={c('brick')} strokeWidth="4" strokeLinecap="round" />
      <circle cx="90" cy="150" r="4" fill={c('rail')} />
    </svg>
  );
}

/** A kitchen tap with drops, for the repair example. Decorative. */
export function TapArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden="true" focusable="false">
      <rect width="120" height="96" rx="10" fill={c('sky')} />
      <path d="M0 64h120" stroke={c('sky-deep')} strokeWidth="2" />
      <path d="M40 0v96M80 0v96" stroke={c('sky-deep')} strokeWidth="2" />
      <rect x="18" y="30" width="16" height="16" rx="3" fill={c('rail')} />
      <path
        d="M34 38h34a12 12 0 0 1 12 12v6"
        stroke={c('rail')}
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="44" y="20" width="22" height="7" rx="3.5" fill={c('brick')} />
      <path d="M55 27v8" stroke={c('rail')} strokeWidth="4" />
      <path d="M80 66c-3 5-3 8 0 10 3-2 3-5 0-10z" fill={c('frame')} />
      <path d="M80 80c-2.5 4-2.5 6 0 8 2.5-2 2.5-4 0-8z" fill={c('frame')} opacity="0.6" />
    </svg>
  );
}
