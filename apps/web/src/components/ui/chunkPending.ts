import { useSyncExternalStore } from 'react';

// Count of route skeletons currently mounted as a Suspense fallback = a route chunk is loading.
// React Router's useNavigation() stays 'idle' for React.lazy pages, so the progress bar reads this too.
let pending = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function markChunkPending(): () => void {
  pending += 1;
  emit();
  return () => {
    pending -= 1;
    emit();
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useChunkPending(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending > 0,
    () => false,
  );
}
