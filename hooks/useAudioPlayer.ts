import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioEngine, EQBand, EnhancementParams, DEFAULT_ENHANCEMENT, DEFAULT_BANDS } from '@/lib/audio-engine';
import { webUSB } from '@/lib/webusb-audio';
import { logger } from '@/lib/logger';

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [preAmp, setPreAmp] = useState(0);
  const [audioSource, setAudioSource] = useState('');
  const [currentTrackName, setCurrentTrackName] = useState('No track loaded');
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  const [analyzer, setAnalyzer] = useState<AnalyserNode | null>(null);
  const [analyzerL, setAnalyzerL] = useState<AnalyserNode | null>(null);
  const [analyzerR, setAnalyzerR] = useState<AnalyserNode | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [enhancement, setEnhancement] = useState<EnhancementParams>({ ...DEFAULT_ENHANCEMENT });
  const [lufsMetrics, setLufsMetrics] = useState({ momentary: -70, shortTerm: -70, peak: -96, psr: 0 });
  const [phaseMode, setPhaseMode] = useState<'iir' | 'fir' | 'hybrid'>('iir');

  const audioRef = useRef<HTMLAudioElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);

  const [pipelineInfo, setPipelineInfo] = useState({ actualSampleRate: 44100, targetSampleRate: 44100, isResampled: false });

  const updatePipelineInfo = useCallback(() => {
    if (engineRef.current) {
        setPipelineInfo({
           actualSampleRate: engineRef.current.actualSampleRate,
           targetSampleRate: engineRef.current.targetSampleRate,
           isResampled: engineRef.current.isResampled
        });
    }
  }, []);

  const playPromiseRef = useRef<Promise<void> | null>(null);

  const initPromiseRef = useRef<Promise<void> | null>(null);

  const initAudio = useCallback(async () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      try {
        if (!engineRef.current) engineRef.current = new AudioEngine();
        await engineRef.current.initialize(audioEl);
        setAnalyzer(engineRef.current.getAnalyzer());
        setAnalyzerL(engineRef.current.getAnalyzerL());
        setAnalyzerR(engineRef.current.getAnalyzerR());
        setAudioContext(engineRef.current.getContext());
        updatePipelineInfo();
        setIsReady(true);
      } catch (err) {
        logger.error('Failed to initialize AudioEngine:', err);
        setErrorHeader('Failed to initialize audio core. Some features may be disabled.');
        // Still set ready so the UI is accessible, but audio might not work
        setIsReady(true);
      } finally {
        initPromiseRef.current = null;
      }
    })();
    return initPromiseRef.current;
  }, [updatePipelineInfo]);

  const togglePlayback = useCallback(async () => {
    if (!audioRef.current) return;
    if (engineRef.current) await engineRef.current.resume();
    else await initAudio();

    try {
      if (!audioRef.current.paused) {
        if (playPromiseRef.current) {
          await playPromiseRef.current;
        }
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const promise = audioRef.current.play();
        if (promise !== undefined) {
          playPromiseRef.current = promise;
          promise
            .then(() => { setIsPlaying(true); setErrorHeader(null); })
            .catch((err: { name: string; }) => {
              if (err.name !== 'AbortError') {
                logger.error('Playback failed:', err);
                setErrorHeader('Autoplay blocked or network error.');
              }
              setIsPlaying(false);
            })
            .finally(() => {
              playPromiseRef.current = null;
            });
        } else {
           setIsPlaying(true);
        }
      }
    } catch (err) {
      if ((err as { name: string; }).name !== 'AbortError') {
        logger.error('Playback error:', err);
      }
      setIsPlaying(false);
    }
  }, [initAudio]);

  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const handleTrackChange = useCallback(async (url: string, name: string) => {
    if (!url) return;
    const wasPlaying = isPlayingRef.current; // use ref to avoid stale closure
    setAudioSource(url);
    setCurrentTrackName(name);
    setErrorHeader(null);

    if (audioRef.current && engineRef.current) {
      if (wasPlaying) {
        try {
          await engineRef.current.crossfade(url, audioRef.current);
          setIsPlaying(true); // only set true after crossfade succeeds (Fix #8)
        } catch (e) {
          logger.warn('Crossfade failed:', e);
          setIsPlaying(false);
        }
      } else {
        audioRef.current.src = url;
        audioRef.current.crossOrigin = url.startsWith('blob:') ? null : 'anonymous';
        audioRef.current.load();
      }
    }
  }, []); // no isPlaying dep – uses ref

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    engineRef.current?.setMasterVolume(v);
  }, []);

  const handlePreAmpChange = useCallback((val: number) => {
    setPreAmp(val);
    engineRef.current?.setPreAmp(val);
  }, []);

  const handleAudioError = useCallback(() => {
    setErrorHeader('Audio Source Error: Check your connection or file format.');
    setIsPlaying(false);
  }, []);

  const handleEnhancementChange = useCallback((params: Partial<EnhancementParams>) => {
    setEnhancement((prev: EnhancementParams) => {
      const next = { ...prev, ...params };
      engineRef.current?.updateEnhancement(next);
      return next;
    });
  }, []);

  const applyBandsToEngine = useCallback((newBands: EQBand[], newPreAmp: number) => {
    if (!engineRef.current) return;
    newBands.forEach((b, i) => engineRef.current?.updateBandParams(i, b));
    engineRef.current.setPreAmp(newPreAmp);
  }, []);

  const handlePhaseModeChange = useCallback((mode: 'iir' | 'fir' | 'hybrid') => {
    setPhaseMode(mode);
    engineRef.current?.setPhaseMode(mode);
  }, []);

  const enableWebUSB = useCallback(async () => {
    if (!webUSB.isActive) {
      const ok = await webUSB.requestDevice();
      if (!ok) return false;
    }
    if (engineRef.current) await engineRef.current.toggleWebUSB(true);
    return true;
  }, []);

  const disableWebUSB = useCallback(async () => {
    await webUSB.disconnect();
    if (engineRef.current) await engineRef.current.toggleWebUSB(false);
  }, []);

  const setExactSampleRate = useCallback(async (rate: number) => {
    if (engineRef.current && audioRef.current) {
      const wasPlaying = !audioRef.current.paused;
      const currentTime = audioRef.current.currentTime;

      // Pause cleanly before reinit to avoid AbortError race
      if (wasPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      }

      await engineRef.current.reinitializeAtRate(audioRef.current, rate);

      // Update ALL audio-graph refs so Visualizer gets fresh nodes
      setAudioContext(engineRef.current.getContext());
      setAnalyzer(engineRef.current.getAnalyzer());
      setAnalyzerL(engineRef.current.getAnalyzerL());
      setAnalyzerR(engineRef.current.getAnalyzerR());
      updatePipelineInfo();

      if (wasPlaying) {
        try {
          // Give the new context a moment to settle
          await new Promise(resolve => setTimeout(resolve, 150));
          audioRef.current!.currentTime = currentTime;
          const promise = audioRef.current!.play();
          if (promise !== undefined) {
            promise
              .then(() => setIsPlaying(true))
              .catch((e) => {
                if ((e as { name: string }).name !== 'AbortError') {
                  logger.warn('Failed to resume playback after sample rate change:', e);
                }
              });
          } else {
            setIsPlaying(true);
          }
        } catch (e) {
          logger.warn('Failed to resume playback after sample rate change:', e);
        }
      }
    }
  }, [updatePipelineInfo]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (engineRef.current && isPlaying) {
        const m = engineRef.current.getLoudnessMetrics();
        setLufsMetrics(m);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.cancel();
        engineRef.current.detachVisualizer();
      }
    };
  }, []);

  return {
    audioRef,
    engineRef,
    isPlaying,
    setIsPlaying,
    volume,
    preAmp,
    setPreAmp,
    audioSource,
    setAudioSource,
    currentTrackName,
    setCurrentTrackName,
    errorHeader,
    setErrorHeader,
    analyzer,
    analyzerL,
    analyzerR,
    audioContext,
    isReady,
    enhancement,
    setEnhancement,
    lufsMetrics,
    phaseMode,
    setPhaseMode,
    initAudio,
    togglePlayback,
    handleTrackChange,
    handleVolumeChange,
    handlePreAmpChange,
    handleEnhancementChange,
    handleAudioError,
    applyBandsToEngine,
    handlePhaseModeChange,
    enableWebUSB,
    disableWebUSB,
    setExactSampleRate,
    pipelineInfo,
  };
}
