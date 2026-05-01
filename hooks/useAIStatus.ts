import { useMemo } from 'react';
import { ContextualPreferenceState } from '@/lib/ai-engine-v2';

/**
 * Extracts AI learning status metrics from learner state
 */
export function useAIStatus(learnerState: ContextualPreferenceState | null) {
  return useMemo(() => {
    let interactionCount = 0;
    let stability = 0;

    if (learnerState && learnerState.totalInteractions !== undefined) {
      interactionCount = learnerState.totalInteractions;

      let sumConf = 0;
      let numContexts = 0;
      
      // Handle both Map and plain object (for SSR or legacy compatibility)
      const contextsIter = (learnerState.contexts instanceof Map)
        ? Array.from(learnerState.contexts.values())
        : Object.values(learnerState.contexts || {}) as Array<{ alphas: number[]; betas: number[] }>;

      for (const ctx of contextsIter) {
        if (!ctx || !ctx.alphas || !ctx.betas) continue;
        let bandConf = 0;
        const alphas = ctx.alphas;
        const betas = ctx.betas;
        
        const len = Math.min(alphas.length, betas.length);
        if (len === 0) continue;

        for (let i = 0; i < len; i++) {
          bandConf += Math.min(1, (alphas[i] + betas[i]) / 10);
        }
        sumConf += bandConf / len;
        numContexts++;
      }
      stability = numContexts > 0 ? sumConf / numContexts : 0;
    }

    return { interactionCount, stability };
  }, [learnerState]);
}
