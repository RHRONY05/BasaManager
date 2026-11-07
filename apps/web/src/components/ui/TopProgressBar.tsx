import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';
import { useChunkPending } from './chunkPending';

export function TopProgressBar() {
  const navigation = useNavigation();
  const chunkPending = useChunkPending();
  const isNavigating = navigation.state !== 'idle' || chunkPending;
  const [hasPassedDelay, setHasPassedDelay] = useState(false);

  useEffect(() => {
    if (!isNavigating) return;

    const timer = setTimeout(() => {
      setHasPassedDelay(true);
    }, 150);

    return () => clearTimeout(timer);
  }, [isNavigating]);

  // Reset delay flag during render when navigation completes to idle
  const [prevNavigating, setPrevNavigating] = useState(isNavigating);
  if (prevNavigating !== isNavigating) {
    setPrevNavigating(isNavigating);
    if (!isNavigating) {
      setHasPassedDelay(false);
    }
  }

  const visible = isNavigating && hasPassedDelay;

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      className="fixed top-0 left-0 right-0 h-0.5 bg-accent z-50 animate-pulse"
    />
  );
}
