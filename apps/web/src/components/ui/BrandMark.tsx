import type { SVGProps } from 'react';

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 15 16 6l10 9" />
      <path d="M9 13v9h14v-9" />
      <path d="M13.5 22v-5h5v5" />
      <path d="M5 26h22M5 29.5h22" strokeWidth="1.6" />
    </svg>
  );
}
