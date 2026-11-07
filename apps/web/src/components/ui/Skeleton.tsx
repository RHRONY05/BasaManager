import type { HTMLAttributes } from 'react';

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-skeleton
      aria-busy="true"
      className={`bg-muted rounded-md animate-pulse motion-reduce:animate-none ${className}`}
      {...props}
    />
  );
}
