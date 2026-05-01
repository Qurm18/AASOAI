'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { AudioEngine } from './audio-engine';

interface AudioContextType {
  engine: AudioEngine | null;
}

const AudioEngineContext = createContext<AudioContextType | undefined>(undefined);

export function AudioEngineProvider({ 
  children, 
  engine 
}: { 
  children: ReactNode; 
  engine: AudioEngine | null;
}) {
  return (
    <AudioEngineContext.Provider value={{ engine }}>
      {children}
    </AudioEngineContext.Provider>
  );
}

export function useAudioEngine() {
  const context = useContext(AudioEngineContext);
  if (context === undefined) {
    throw new Error('useAudioEngine must be used within an AudioEngineProvider');
  }
  return context.engine;
}
