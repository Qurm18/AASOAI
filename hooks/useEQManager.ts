import { useState, useCallback, useRef, useEffect } from 'react';
import { EQBand, DEFAULT_BANDS, AudioEngine } from '@/lib/audio-engine';
import { useEQHistory } from '@/hooks/use-eq-history';
import { optimalQ } from '@/lib/math';
import { persistCurrentState, recordSessionSummary } from '@/lib/profile-store';
import { logger } from '@/lib/logger';

export function useEQManager(
  hookEngineRef: React.RefObject<AudioEngine | null>,
  preAmp: number,
  setPreAmp: (v: number) => void,
  setIsAICalibrated: (v: boolean) => void,
  setProfileName: (v: string | null) => void,
  hookApplyBandsToEngine: (bands: EQBand[], preAmp: number) => void
) {
  const [bands, setBands] = useState<EQBand[]>(DEFAULT_BANDS);
  const [baseCorrection, setBaseCorrection] = useState<number[]>(new Array(10).fill(0));
  const history = useEQHistory();
  const persistTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [lastManualEditTime, setLastManualEditTime] = useState(0);

  const debouncedPersist = useCallback((newBands: EQBand[], newPreAmp: number) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => persistCurrentState(newBands, newPreAmp), 500);
  }, []);

  const handleBandChange = useCallback((index: number, params: Partial<EQBand>) => {
    try {
      const newBands = [...bands];
      newBands[index] = { ...newBands[index], ...params };

      if (params.gain !== undefined && params.q === undefined) {
        const me = newBands[index];
        const left = newBands[index - 1];
        const right = newBands[index + 1];
        const neighbourFreq = left && right
          ? (Math.abs(left.frequency - me.frequency) < Math.abs(right.frequency - me.frequency)
              ? left.frequency : right.frequency)
          : (left ?? right)?.frequency ?? me.frequency * 2;
        const newQ = optimalQ(me.frequency, neighbourFreq, me.gain, { minQ: 0.5, maxQ: 4 });
        newBands[index] = { ...me, q: newQ };
        hookEngineRef.current?.updateBandParams(index, { ...params, q: newQ });
      } else {
        hookEngineRef.current?.updateBandParams(index, params);
      }
      setBands(newBands);
      setLastManualEditTime(Date.now());

      if (params.gain !== undefined) history.push(newBands, preAmp);

      const maxGain = Math.max(...newBands.map((b) => b.gain));
      const needed = maxGain > 0 ? -maxGain * 0.5 : 0;
      const newPreAmp = needed < preAmp ? needed : preAmp;
      if (newPreAmp !== preAmp) {
        setPreAmp(newPreAmp);
        hookEngineRef.current?.setPreAmp(newPreAmp);
      }
      debouncedPersist(newBands, newPreAmp);
    } catch (err) {
      logger.error('Failed to update EQ band:', err);
    }
  }, [bands, history, preAmp, hookEngineRef, setPreAmp, debouncedPersist]);

  const handleReset = useCallback(() => {
    history.push(bands, preAmp, 'Before reset');
    setBands(DEFAULT_BANDS);
    DEFAULT_BANDS.forEach((_, i) => hookEngineRef.current?.updateBand(i, 0));
    setIsAICalibrated(false);
    setProfileName(null);
    setPreAmp(0);
    hookEngineRef.current?.setPreAmp(0);
    debouncedPersist(DEFAULT_BANDS, 0);
  }, [bands, preAmp, history, debouncedPersist, setIsAICalibrated, setProfileName, hookEngineRef, setPreAmp]);

  const handleUndo = useCallback(() => {
    if (!history.canUndo()) return;
    const s = history.undo();
    if (!s) return;
    setBands(s.bands); setPreAmp(s.preAmp);
    hookApplyBandsToEngine(s.bands, s.preAmp);
    debouncedPersist(s.bands, s.preAmp);
  }, [history, setPreAmp, hookApplyBandsToEngine, debouncedPersist]);

  const handleRedo = useCallback(() => {
    if (!history.canRedo()) return;
    const s = history.redo();
    if (!s) return;
    setBands(s.bands); setPreAmp(s.preAmp);
    hookApplyBandsToEngine(s.bands, s.preAmp);
    debouncedPersist(s.bands, s.preAmp);
  }, [history, setPreAmp, hookApplyBandsToEngine, debouncedPersist]);

  return {
    bands,
    setBands,
    baseCorrection,
    setBaseCorrection,
    history,
    lastManualEditTime,
    setLastManualEditTime,
    debouncedPersist,
    handleBandChange,
    handleReset,
    handleUndo,
    handleRedo,
  };
}
