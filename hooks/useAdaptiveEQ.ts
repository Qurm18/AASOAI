import { useState, useRef, useEffect, useCallback } from 'react';
import { EQBand } from '@/lib/audio-engine';
import { loadLearnerState, persistLearnerState } from '@/lib/profile-store';
import { AudioEngine } from '@/lib/audio-engine';
import { ContextualBayesianLearner, ContextualPreferenceState, deserializeContextualState, serializeContextualState, MusicGenre, TempoCategory, MixComplexity, VocalPresence } from '@/lib/ai-engine-v2';
import { logger } from '@/lib/logger';

export function useAdaptiveEQ(
  hookEngineRef: React.MutableRefObject<AudioEngine | null>,
  isPlaying: boolean,
  preAmp: number,
  hookApplyBandsToEngine: (bands: EQBand[], preAmp: number) => void
) {
  const leanerRef = useRef<ContextualBayesianLearner | null>(null);
  const [learnerState, setLearnerState] = useState<ContextualPreferenceState | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('sonic_contextual_prefs');
    if (saved) {
      try {
        return deserializeContextualState(saved);
      } catch (e) {
        logger.warn('Failed to load learner state:', e);
      }
    }
    const learner = new ContextualBayesianLearner();
    return learner.getState();
  });

  const [isAdaptiveMode, setIsAdaptiveMode] = useState(true);
  const [sectionType, setSectionType] = useState<'intro' | 'verse' | 'chorus' | 'drop' | 'outro'>('verse');

  useEffect(() => {
    if (learnerState) {
      leanerRef.current = new ContextualBayesianLearner(learnerState);
    }
  }, [learnerState]);

  const handleInteraction = useCallback((choice: 'A' | 'B' | 'DISLIKE_BOTH' | 'NO_PREFERENCE', interaction: { 
    eqA: number[], 
    eqB: number[], 
    listenTime: number, 
    confidence?: number 
  }) => {
    if (!hookEngineRef.current || !leanerRef.current) return;

    const fingerprint = hookEngineRef.current.getTrackFingerprint();
    const energies = hookEngineRef.current.getAdaptiveFeatures();
    if (!energies) return;

    // Convert fingerprint to context
    const char = hookEngineRef.current.classifyTrackCharacter(
      [energies.lowEnergy, energies.midEnergy, energies.highEnergy], 
      fingerprint
    );

    const context = {
      genre: char.genre as MusicGenre,
      tempoCategory: 'moderate' as TempoCategory,
      complexity: (char.dynamicWide ? 'orchestral' : 'dense') as MixComplexity,
      vocalPresence: (char.genre === 'vocal-mid' ? 'prominent' : 'none') as VocalPresence,
    };

    leanerRef.current.updatePreference(context, interaction.eqA, interaction.eqB, choice, {
      listenTime: interaction.listenTime,
      confidence: interaction.confidence
    });

    const newState = leanerRef.current.getState();
    setLearnerState({ ...newState });
    localStorage.setItem('sonic_contextual_prefs', serializeContextualState(newState));

  }, [hookEngineRef]);

  return {
    learnerState,
    isAdaptiveMode,
    setIsAdaptiveMode,
    sectionType,
    setSectionType,
    handleInteraction,
    leanerRef,
    setLearnerState
  };
}
