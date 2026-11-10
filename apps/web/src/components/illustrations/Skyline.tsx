import type { SVGProps } from 'react';

// [x, width, height] of each building in one 600-wide strip, drawn from the bottom up.
const STRIP: [number, number, number][] = [
  [0, 54, 70],
  [50, 40, 104],
  [86, 62, 82],
  [144, 34, 122],
  [174, 70, 92],
  [240, 46, 130],
  [282, 58, 76],
  [336, 40, 112],
  [372, 66, 88],
  [434, 36, 126],
  [466, 60, 80],
  [522, 44, 108],
  [562, 38, 72],
];
// Two strips side by side (the second shifted, with different heights) make a 1200×140 skyline.
const BUILDINGS = [
  ...STRIP,
  ...STRIP.map(([x, w, h], i): [number, number, number] => [x + 600, w, i % 2 ? h - 14 : h + 6]),
];

/**
 * A row of building silhouettes for banners. Buildings use `currentColor`; windows use `windowFill`
 * (a CSS colour, normally a token). Decorative only.
 */
export function Skyline({ windowFill, ...props }: SVGProps<SVGSVGElement> & { windowFill: string }) {
  return (
    <svg
      data-layout-ignore
      viewBox="0 0 1200 140"
      preserveAspectRatio="xMidYMax meet"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {BUILDINGS.map(([x, w, h], i) => {
        const top = 140 - h;
        const cols = Math.max(1, Math.floor((w - 10) / 14));
        const rows = Math.floor((h - 18) / 18);
        return (
          <g key={x}>
            <rect x={x} y={top} width={w} height={h} />
            {i % 3 === 1 && <rect x={x + w / 2 - 8} y={top - 10} width="16" height="10" />}
            {Array.from({ length: rows }).flatMap((_, r) =>
              Array.from({ length: cols }).map((__, col) =>
                (r * 7 + col * 3 + i) % 4 === 0 ? (
                  <rect
                    key={`${r}-${col}`}
                    x={x + 7 + col * 14}
                    y={top + 10 + r * 18}
                    width="6"
                    height="8"
                    fill={windowFill}
                  />
                ) : null,
              ),
            )}
          </g>
        );
      })}
    </svg>
  );
}
