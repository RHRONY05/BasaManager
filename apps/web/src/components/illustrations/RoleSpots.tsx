import type { SVGProps } from 'react';

const c = (name: string) => `var(--illo-${name})`;

function Frame({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false" {...props}>
      <circle cx="80" cy="64" r="52" fill={c('sky')} />
      <rect x="20" y="110" width="120" height="6" rx="3" fill={c('ground')} />
      {children}
    </svg>
  );
}

/** Landlord: a building and its keys. */
export function LandlordSpot(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <rect x="40" y="38" width="52" height="72" fill={c('facade')} />
      <rect x="84" y="38" width="8" height="72" fill={c('facade-shade')} />
      <rect x="36" y="32" width="60" height="8" rx="2" fill={c('frame')} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1].map((col) => (
          <rect
            key={`${r}${col}`}
            x={48 + col * 20}
            y={48 + r * 14}
            width="12"
            height="9"
            rx="1.5"
            fill={(r + col) % 3 === 0 ? c('window-lit') : c('window')}
          />
        )),
      )}
      <rect x="56" y="100" width="18" height="10" fill={c('frame')} />
      <circle cx="118" cy="56" r="11" stroke={c('brick')} strokeWidth="5" />
      <path d="M118 67v34M118 90h8M118 98h6" stroke={c('brick')} strokeWidth="5" strokeLinecap="round" />
    </Frame>
  );
}

/** Caretaker: a checklist and a wrench. */
export function CaretakerSpot(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <rect
        x="42"
        y="26"
        width="58"
        height="80"
        rx="6"
        fill={c('facade')}
        stroke={c('rail')}
        strokeWidth="2"
      />
      <rect x="58" y="20" width="26" height="12" rx="3" fill={c('frame')} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="56" cy={50 + i * 18} r="6" fill={i < 2 ? c('leaf') : c('facade-shade')} />
          {i < 2 && (
            <path
              d={`M53 ${50 + i * 18}l2 2.5 4-4.5`}
              stroke={c('facade')}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <rect x="68" y={47 + i * 18} width={i === 1 ? 20 : 24} height="6" rx="3" fill={c('window')} />
        </g>
      ))}
      <g transform="rotate(38 120 72)">
        <rect x="115" y="70" width="10" height="40" rx="5" fill={c('brick')} />
        <circle cx="120" cy="64" r="13" fill={c('brick')} />
        <rect x="115" y="48" width="10" height="14" rx="2" fill={c('sky')} />
      </g>
    </Frame>
  );
}

/** Tenant: a phone showing a paid bill. */
export function TenantSpot(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <rect x="54" y="16" width="54" height="94" rx="10" fill={c('frame')} />
      <rect x="59" y="25" width="44" height="76" rx="5" fill={c('facade')} />
      <rect x="65" y="33" width="22" height="5" rx="2.5" fill={c('rail')} opacity="0.6" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="65" y={46 + i * 10} width="18" height="4" rx="2" fill={c('window')} />
          <rect x="88" y={46 + i * 10} width="9" height="4" rx="2" fill={c('window')} />
        </g>
      ))}
      <rect x="65" y="80" width="32" height="12" rx="3" fill={c('frame')} />
      <circle cx="110" cy="30" r="13" fill={c('leaf')} />
      <path
        d="M104 30l4 4 8-8"
        stroke={c('facade')}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}
