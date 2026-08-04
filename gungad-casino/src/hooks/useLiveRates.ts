import { useEffect, useState } from 'react';
import { fetchLiveRates } from '../utils/currencies';

const REFRESH_MS = 30 * 60 * 1000; // 30 min

/**
 * Loads live FX rates on mount and refreshes periodically.
 * `version` bumps when rates update so UI re-renders with new conversion.
 */
export function useLiveRates() {
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const rates = await fetchLiveRates();
      if (cancelled) return;
      if (rates) {
        setVersion((v) => v + 1);
        setReady(true);
      }
    };

    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { version, ready };
}
