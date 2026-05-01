'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useCalibration } from '@/hooks/useCalibration';
import { useProfileManager } from '@/hooks/useProfileManager';
import { useTrackLibrary } from '@/hooks/useTrackLibrary';
import { useAdaptiveEQ } from '@/hooks/useAdaptiveEQ';
import { useTuningAB } from '@/hooks/useTuningAB';
import { useAIStatus } from '@/hooks/useAIStatus';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEQManager } from '@/hooks/useEQManager';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { AudioEngine } from '@/lib/audio-engine';

import { MainAppView } from '@/components/MainAppView';
import { recordSessionSummary } from '@/lib/profile-store';
import { MusicContext, MusicGenre, TempoCategory, MixComplexity, VocalPresence, ContextualPreferenceState } from '@/lib/ai-engine-v2';
import { logger } from '@/lib/logger';

const TRACKS = [
  { id: 't1', name: 'Ambient Soundscape', artist: 'Zen Audio', genre: 'Ambient', duration: '3:00', url: 'https://cdn.freesound.org/previews/612/612459_5674468-lq.mp3' },
  { id: 't2', name: 'Electronic Pulse', artist: 'Volt Records', genre: 'Electronic', duration: '2:45', url: 'https://cdn.freesound.org/previews/528/528129_4398532-lq.mp3' },
  { id: 't3', name: 'Jazz Lounge', artist: 'Classic Trio', genre: 'Jazz', duration: '4:15', url: 'https://cdn.freesound.org/previews/414/414184_7766176-lq.mp3' },
];

export function MainApp() {
  usePerformanceMonitor();
  const audio = useAudioPlayer();
  const calibration = useCalibration();
  const profile = useProfileManager();

  const library = useTrackLibrary(TRACKS, audio.audioSource, audio.handleTrackChange);
  
  const eq = useEQManager(
    audio.engineRef,
    audio.preAmp,
    audio.setPreAmp,
    calibration.setIsAICalibrated,
    profile.setProfileName,
    audio.applyBandsToEngine
  );

  const adaptive = useAdaptiveEQ(
    audio.engineRef,
    audio.isPlaying,
    audio.preAmp,
    audio.applyBandsToEngine
  );

  const aiStatus = useAIStatus(adaptive.learnerState);
  const isMobile = useIsMobile();

  const tuningAB = useTuningAB(
    audio.audioSource,
    audio.audioRef,
    audio.engineRef,
    audio.togglePlayback,
    audio.setIsPlaying,
    audio.setAudioSource,
    audio.setCurrentTrackName,
    TRACKS as any
  );

  // Remaining UI state
  const [spectralPeaks, setSpectralPeaks] = useState<number[]>([]);
  const [lastSync, setLastSync] = useState<string>('');
  const [urlInput, setUrlInput] = useState('');
  const [showRewImport, setShowRewImport] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [targetCurveId, setTargetCurveId] = useState<string>('none');
  const [showEnhancement, setShowEnhancement] = useState(false);
  const [useZeroLatency, setUseZeroLatency] = useState(false);
  const [showAnalysisSidebar, setShowAnalysisSidebar] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Derive engine instance instead of storing in state
  const engineInstance = audio.isReady && audio.engineRef.current ? audio.engineRef.current : null;

  const refs = {
    fileInput: useRef<HTMLInputElement>(null),
    folderInput: useRef<HTMLInputElement>(null),
    importFile: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (isMobile) {
      Promise.resolve().then(() => setShowAnalysisSidebar(false));
    }
  }, [isMobile]);

  useEffect(() => {
    if (!adaptive.isAdaptiveMode || !audio.isPlaying || !audio.engineRef.current || !adaptive.leanerRef.current) return;

    const interval = setInterval(() => {
      if (Date.now() - eq.lastManualEditTime < 10000) return;

      const engine = audio.engineRef.current!;
      const energies = engine.getAdaptiveFeatures();
      const fingerprint = engine.getTrackFingerprint();
      if (!energies) return;

      const char = engine.classifyTrackCharacter(
        [energies.lowEnergy, energies.midEnergy, energies.highEnergy], 
        fingerprint
      );

      const contextObj: MusicContext = {
        genre: char.genre as MusicGenre,
        tempoCategory: 'moderate' as TempoCategory,
        complexity: (char.dynamicWide ? 'orchestral' : 'dense') as MixComplexity,
        vocalPresence: (char.genre === 'vocal-mid' ? 'prominent' : 'none') as VocalPresence,
      };

      const suggestion = adaptive.leanerRef.current!.suggestGainsForContext(contextObj);
      const adjustment = suggestion.gains;
      const dynamicFreqs = engine.computeDynamicEQFrequencies(fingerprint);

      eq.setBands((prev) => {
        const hasSignificantGain = adjustment.some((a, i) => Math.abs(a - prev[i].gain) > 0.3);
        const hasSignificantFreq = dynamicFreqs.some((f, i) => Math.abs(f - prev[i].frequency) > prev[i].frequency * 0.05);

        if (!hasSignificantGain && !hasSignificantFreq) return prev;

        const next = prev.map((b, i) => ({
          ...b,
          gain: Number((b.gain * 0.9 + (adjustment[i] || 0) * 0.1).toFixed(2)),
          frequency: Math.round(b.frequency * 0.95 + (dynamicFreqs[i] || b.frequency) * 0.05)
        }));
        
        audio.applyBandsToEngine(next, audio.preAmp);
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [adaptive.isAdaptiveMode, audio.isPlaying, audio.engineRef, adaptive.leanerRef, eq.lastManualEditTime, audio.preAmp, audio.applyBandsToEngine]);

  const handleDynamicEqMasterChange = (val: boolean) => {
    audio.handleEnhancementChange({ dynamicEqMaster: val });
  };

  useEffect(() => {
    const t = new Date().toLocaleTimeString();
    const id = setTimeout(() => setLastSync(t), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (audio.isPlaying) {
      timer = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [audio.isPlaying]);

  const bandsRef = useRef(eq.bands);
  const preAmpRef = useRef(audio.preAmp);
  useEffect(() => { bandsRef.current = eq.bands; preAmpRef.current = audio.preAmp; }, [eq.bands, audio.preAmp]);

  useEffect(() => {
    if (audio.engineRef.current && audio.isReady) {
      audio.applyBandsToEngine(bandsRef.current, preAmpRef.current);
    }
  }, [audio.isReady, audio.audioSource, audio.engineRef, audio.applyBandsToEngine]);
  
  useEffect(() => {
    if (!audio.audioSource || !audio.engineRef.current) return;
    
    const analyzePeaks = async () => {
      setIsAnalyzing(true);
      try {
        const peaks = await audio.engineRef.current!.getSpectralPeaks(audio.audioSource);
        setSpectralPeaks(peaks);
      } catch (err) {
        logger.warn('Failed to discover resonances:', err);
      } finally {
        setIsAnalyzing(false);
      }
    };
    
    analyzePeaks();
  }, [audio.audioSource, audio.engineRef]);

  useEffect(() => {
    if (audio.engineRef.current) audio.applyBandsToEngine(eq.bands, audio.preAmp);
    profile.refreshProfiles();
  }, [eq.bands, audio.preAmp, audio.applyBandsToEngine, profile.refreshProfiles, audio.engineRef]);

  const restoreBands = useCallback(() => {
    audio.engineRef.current?.exitABMode();
    audio.applyBandsToEngine(eq.bands, audio.preAmp);
    calibration.setShowWizard(false);
  }, [eq.bands, audio.preAmp, audio.engineRef, audio.applyBandsToEngine, calibration.setShowWizard]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault(); eq.handleUndo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault(); eq.handleRedo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault(); eq.handleRedo(); return;
      }
      if (e.key === ' ' && !calibration.showWizard && !profile.showProfilePanel && !profile.showSaveDialog && !showExportDialog) {
        e.preventDefault(); audio.togglePlayback(); return;
      }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { eq.handleReset(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        profile.setSaveNameInput(profile.profileName || '');
        profile.setShowSaveDialog(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setShowExportDialog(true);
        return;
      }
      if (e.key === 'Escape') {
        if (calibration.showWizard) { restoreBands(); return; }
        if (profile.showProfilePanel) { profile.setShowProfilePanel(false); return; }
        if (profile.showSaveDialog) { profile.setShowSaveDialog(false); return; }
        if (showExportDialog) { setShowExportDialog(false); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [calibration.showWizard, profile.showProfilePanel, profile.showSaveDialog, showExportDialog, profile.profileName, audio.togglePlayback, restoreBands, eq.handleReset, eq.handleUndo, eq.handleRedo, profile.setSaveNameInput, profile.setShowSaveDialog, profile.setShowProfilePanel]);

  const handleTuningComplete = (result: any) => {
    calibration.handleCalibrationComplete(result);
    
    const qs = result.profile?.qSuggestions;
    const newBands = eq.bands.map((band, i) => ({
      ...band,
      gain: result.gains[i],
      q: qs?.[i] ?? band.q,
    }));
    eq.setBands(newBands);
    profile.setProfileName(result.profileName);
    profile.setProfileColor(result.profile?.color ?? '#F27D26');
    profile.setProfileGenre(result.profile?.genre ?? null);
    audio.applyBandsToEngine(newBands, audio.preAmp);

    const maxGain = Math.max(...result.gains);
    const newPreAmp = maxGain > 0 ? -maxGain : 0;
    audio.handlePreAmpChange(newPreAmp);

    eq.history.push(newBands, newPreAmp, `AI: ${result.profileName}`);
    eq.debouncedPersist(newBands, newPreAmp);

    if (adaptive.leanerRef.current) {
      recordSessionSummary(adaptive.leanerRef.current.getState());
    }
  };

  const handleSaveProfileLocal = () => {
    const name = profile.saveNameInput.trim() || profile.profileName || 'My Profile';
    const saved = profile.handleSaveProfile(name, eq.bands, audio.preAmp, {
      genre: profile.profileGenre ?? undefined,
      color: profile.profileColor,
      source: calibration.isAICalibrated ? 'ai' : 'manual',
    });

    if (calibration.isAICalibrated && adaptive.leanerRef.current) {
      recordSessionSummary(adaptive.leanerRef.current.getState());
    }

    profile.refreshProfiles();
    profile.setSaveNameInput('');
    profile.setShowSaveDialog(false);
    profile.setProfileName(saved.name);
  };

  const handleLoadProfile = (loadedProfile: any) => {
    eq.history.push(eq.bands, audio.preAmp, 'Before load profile');
    eq.setBands(loadedProfile.bands);
    audio.setPreAmp(loadedProfile.preAmp);
    profile.setProfileName(loadedProfile.name);
    profile.setProfileColor(loadedProfile.color ?? '#F27D26');
    profile.setProfileGenre(loadedProfile.genre ?? null);
    calibration.setIsAICalibrated(loadedProfile.source === 'ai' || loadedProfile.source === 'import');
    audio.applyBandsToEngine(loadedProfile.bands, loadedProfile.preAmp);
    eq.debouncedPersist(loadedProfile.bands, loadedProfile.preAmp);
    
    profile.setShowProfilePanel(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    profile.setImportError(null);
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (parsed.bands && Array.isArray(parsed.bands)) {
          eq.setBands(parsed.bands);
          if (parsed.preAmp !== undefined) audio.setPreAmp(parsed.preAmp);
          profile.setProfileName(file.name.replace('.json', ''));
          profile.setProfileColor(parsed.color || '#F27D26');
          if (parsed.genre) profile.setProfileGenre(parsed.genre);
          if (parsed.source === 'ai') calibration.setIsAICalibrated(true);
        } else {
          profile.setImportError('Invalid JSON structure. Needs "bands" array.');
        }
      } else if (file.name.endsWith('.txt')) {
         profile.setImportError('Please use the REW Import tool for .txt files');
      }
    } catch (err) {
      profile.setImportError('Failed to parse file');
    }
    if (refs.importFile.current) {
      refs.importFile.current.value = '';
    }
  };

  useEffect(() => {
    const handleGesture = () => {
      if (audio.engineRef.current) {
        audio.engineRef.current.getContext?.()?.resume();
      }
    };
    window.addEventListener('click', handleGesture, { capture: true });
    window.addEventListener('keydown', handleGesture, { capture: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, [audio.engineRef]);

  const deferredBands = useDeferredValue(eq.bands);

  const state = {
    spectralPeaks, setSpectralPeaks,
    lastSync, setLastSync,
    urlInput, setUrlInput,
    showRewImport, setShowRewImport,
    sessionDuration, setSessionDuration,
    showExportDialog, setShowExportDialog,
    targetCurveId, setTargetCurveId,
    showEnhancement, setShowEnhancement,
    useZeroLatency, setUseZeroLatency,
    showAnalysisSidebar, setShowAnalysisSidebar,
    engineInstance,
    isAnalyzing, setIsAnalyzing,
    deferredBands,
    refs,
    handleDynamicEqMasterChange,
    restoreBands,
    handleTuningComplete,
    handleSaveProfileLocal,
    handleLoadProfile,
    handleImportFile,
    TRACKS
  };

  return <MainAppView audio={audio} eq={eq} ai={calibration} profiles={profile} adaptive={adaptive} tuningAB={tuningAB} aiStatus={aiStatus} library={library} state={state} />;
}
