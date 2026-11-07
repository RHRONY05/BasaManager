import { useEffect } from 'react';
import { Skeleton } from './Skeleton';
import { markChunkPending } from './chunkPending';

export function RouteSkeleton() {
  useEffect(() => markChunkPending(), []);
  return (
    <div data-skeleton aria-busy="true" className="w-full max-w-4xl space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="rounded-lg border border-border bg-surface p-6 space-y-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}
