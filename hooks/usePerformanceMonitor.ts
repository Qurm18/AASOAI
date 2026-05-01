import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export function usePerformanceMonitor() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.PerformanceObserver) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          logger.debug(`[PERF] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
        }
      });
      observer.observe({ entryTypes: ['measure', 'navigation'] });
      return () => observer.disconnect();
    } catch (e) {
      logger.warn('PerformanceObserver failed to start.', e);
    }
  }, []);
}
