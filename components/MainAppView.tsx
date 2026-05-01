/* eslint-disable react-hooks/refs */
'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Upload, List, Music } from 'lucide-react';
import { AudioEngineProvider } from '@/lib/audio-engine-context';
import { TARGET_CURVES } from '@/lib/eq-targets';
import { exportProfileAsAPO } from '@/lib/profile-store';
import { earDamageRisk } from '@/lib/math/loudness-adaptive';

// Components
import { AudioInitOverlay } from '@/components/AudioInitOverlay';
import { Header } from '@/components/Header';
import { EQCurve } from '@/components/EQCurve';
import { ZeroLatencyVisualizer } from '@/components/ZeroLatencyVisualizer';
import { Visualizer } from '@/components/Visualizer';
import { PlayerSection } from '@/components/PlayerSection';
import { AnalysisSidebar } from '@/components/AnalysisSidebar';
import { EQSectionHeader } from '@/components/EQSectionHeader';
import { EQPanel } from '@/components/EQPanel';
import { EnhancementPanel } from '@/components/EnhancementPanel';
import { AdaptiveEQModule } from '@/components/AdaptiveEQModule';
import { HearingProtectionIndicator } from '@/components/HearingProtectionIndicator';
import { MainAppFooter } from '@/components/MainAppFooter';
import { RewImport } from '@/components/RewImport';
import { TuningWizard } from '@/components/TuningWizard';
import { ExportDialog } from '@/components/ExportDialog';
import { ProfileLibraryModal } from '@/components/ProfileLibraryModal';
import { TrackLibraryModal } from '@/components/TrackLibraryModal';
import { SaveProfileModal } from '@/components/SaveProfileModal';

export function MainAppView({ audio, eq, ai, profiles, adaptive, tuningAB, aiStatus, library, state }: any) {
  const {
    spectralPeaks, setSpectralPeaks, lastSync, setLastSync, urlInput, setUrlInput,
    showRewImport, setShowRewImport, sessionDuration, sessionDurationStr, showExportDialog,
    setShowExportDialog, targetCurveId, setTargetCurveId, showEnhancement,
    setShowEnhancement, useZeroLatency, setUseZeroLatency, showAnalysisSidebar,
    setShowAnalysisSidebar, engineInstance, isAnalyzing, setIsAnalyzing,
    deferredBands, refs, handleDynamicEqMasterChange, restoreBands,
    handleTuningComplete, handleSaveProfileLocal, handleLoadProfile,
    handleImportFile, handleUrlSubmit, TRACKS
  } = state || {};
  const { importFile, fileInput, folderInput } = refs || {};
  const risk = useMemo(() => {
    return earDamageRisk(
      eq.bands.map((b: any) => b.gain),
      eq.bands.map((b: any) => b.frequency),
      'moderate',
      sessionDuration
    );
  }, [eq.bands, sessionDuration]);

  return (
    <AudioEngineProvider engine={engineInstance}>
      <main className="min-h-screen bg-[#07080a] text-white relative overflow-x-hidden">
        {/* Ambient aurora */}
        <div className="sonic-aurora" aria-hidden />

        {/* Activation overlay */}
        <AudioInitOverlay isReady={audio.isReady} onInit={audio.initAudio} />

        {/* App shell */}
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-3 md:px-6 lg:px-8 py-4 md:py-6">
          {/* Header (sticky-ish glass) */}
          <Header
            profileName={profiles.profileName}
            calibrationConfidence={ai.calibrationConfidence}
            interactionCount={aiStatus.interactionCount}
            stability={aiStatus.stability}
            isAICalibrated={ai.isAICalibrated}
            profileColor={profiles.profileColor}
            canUndo={eq.history.canUndo()}
            canRedo={eq.history.canRedo()}
            onUndo={eq.handleUndo}
            onRedo={eq.handleRedo}
            onShowProfilePanel={() => profiles.setShowProfilePanel(true)}
            onShowSaveDialog={() => { profiles.setSaveNameInput(profiles.profileName || ''); profiles.setShowSaveDialog(true); }}
            onShowExportDialog={() => setShowExportDialog(true)}
            onImportClick={() => importFile.current?.click()}
            onAICalibrate={() => {
              ai.setSelectionMode(true);
              ai.setSelectedTrackUrls([audio.audioSource]);
              library.setShowTrackLibrary(true);
            }}
            onQuickCalibrate={() => ai.setShowWizard(true)}
            showAnalysisSidebar={showAnalysisSidebar}
            setShowAnalysisSidebar={setShowAnalysisSidebar}
            savedProfilesCount={profiles.savedProfiles.length}
          />
          <input
            ref={importFile}
            type="file"
            accept=".json,.txt"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Top: Curve + Visualizer (stacked) | Player + Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 items-start">
            {/* LEFT: Curve, Visualizer, Player */}
            <div className={`${showAnalysisSidebar ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4 md:space-y-5 transition-all duration-300 w-full`}>
              {/* EQ Curve with target overlay control */}
              <div className="relative">
                {isAnalyzing && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl border border-white/10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-[#F27D26]/20 border-t-[#F27D26] rounded-full animate-spin" />
                      <p className="text-[10px] font-mono text-[#F27D26] uppercase tracking-[0.2em] animate-pulse">Analyzing Resonances...</p>
                    </div>
                  </div>
                )}
                <EQCurve 
                  bands={deferredBands} 
                  baseCorrection={eq.baseCorrection}
                  target={targetCurveId} 
                  spectralPeaks={spectralPeaks}
                />
                {/* Target curve picker */}
                <div className="absolute top-3 right-3 flex items-center gap-1 z-20">
                  <Target className="w-3 h-3 text-white/40" />
                  <select
                    value={targetCurveId}
                    onChange={(e) => setTargetCurveId(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-md text-[9px] font-mono uppercase tracking-widest text-white/70 px-1.5 py-0.5 outline-none cursor-pointer hover:border-white/20"
                    title="Reference target curve"
                  >
                    <option value="none">No Target</option>
                    {TARGET_CURVES.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Visualizer */}
              <div className="relative">
                {isAnalyzing && (
                  <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center rounded-2xl border border-white/10">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map(i => (
                        <motion.div
                          key={i}
                          animate={{ height: [10, 30, 10] }}
                          transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                          className="w-1 bg-[#F27D26]/40 rounded-full"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {useZeroLatency ? (
                   <ZeroLatencyVisualizer key={`zlv-${audio.audioContext?.sampleRate ?? 0}-${engineInstance ? 1 : 0}`} pipelineInfo={audio.pipelineInfo} />
                ) : (
                   <Visualizer
                     key={`viz-${engineInstance ? 1 : 0}`}
                     analyzer={audio.analyzer} 
                     analyzerL={audio.analyzerL} 
                     analyzerR={audio.analyzerR} 
                     metrics={audio.lufsMetrics} 
                   />
                )}
                <div className="absolute top-2 right-2 z-10 flex gap-2">
                   {useZeroLatency && (
                      <button 
                         onClick={() => {
                            const rates = [44100, 48000, 96000, 192000];
                            const idx = rates.indexOf(audio.pipelineInfo?.targetSampleRate || 44100);
                            const nextIdx = (idx + 1) % rates.length;
                            audio.setExactSampleRate(rates[nextIdx]);
                         }}
                        className="px-2 py-1 text-[9px] uppercase font-mono rounded bg-white/10 hover:bg-white/20 text-white"
                      >
                        Rate: {audio.pipelineInfo?.targetSampleRate ? (audio.pipelineInfo.targetSampleRate/1000).toFixed(1) : 44.1}k
                      </button>
                   )}
                   <button 
                      onClick={() => setUseZeroLatency(false)}
                     className={`px-2 py-1 text-[9px] uppercase font-mono rounded ${!useZeroLatency ? 'bg-[#F27D26] text-black font-bold' : 'bg-black/50 text-white/50 border border-white/10'}`}
                   >
                     Standard
                   </button>
                   <button 
                      onClick={() => setUseZeroLatency(true)}
                     className={`px-2 py-1 text-[9px] uppercase font-mono rounded ${useZeroLatency ? 'bg-[#F27D26] text-black font-bold' : 'bg-black/50 text-white/50 border border-white/10'}`}
                   >
                     Offscreen
                   </button>
                </div>
              </div>

              {/* UI-01 / UI-02: Empty state — guide first-time users */}
              {!audio.audioSource && (
                <div className="flex flex-col items-center justify-center gap-4 py-8 px-6 rounded-2xl border border-dashed border-white/10 bg-black/20 backdrop-blur-sm text-center">
                  <div className="w-14 h-14 rounded-full bg-[#F27D26]/10 border border-[#F27D26]/20 flex items-center justify-center">
                    <Music className="w-6 h-6 text-[#F27D26]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base mb-1">Load a track to begin</p>
                    <p className="text-[#8E9299] text-xs max-w-xs">
                      Upload your own audio file, paste a URL, or open the track library to get started with AI-powered EQ calibration.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => fileInput.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] hover:bg-[#F27D26]/90 text-black font-semibold text-xs rounded-xl transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Audio
                    </button>
                    <button
                      onClick={() => library.setShowTrackLibrary(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs rounded-xl transition-all"
                    >
                      <List className="w-3.5 h-3.5" />
                      Browse Library
                    </button>
                  </div>
                </div>
              )}

              {/* Player */}
              <PlayerSection
                currentTrackName={audio.currentTrackName}
                isPlaying={audio.isPlaying}
                onBrowseLibrary={() => library.setShowTrackLibrary(true)}
                onRewImport={() => setShowRewImport(true)}
                onFileUploadClick={() => fileInput.current?.click()}
                fileInputRef={fileInput}
                handleFileUpload={audio.handleFileUpload}
                onPrevTrack={library.handlePrevTrack}
                onTogglePlayback={audio.togglePlayback}
                onNextTrack={library.handleNextTrack}
                volume={audio.volume}
                onVolumeChange={(val: any) => audio.handleVolumeChange(val)}
              />
            </div>

            <AnalysisSidebar
              showAnalysisSidebar={showAnalysisSidebar}
              urlInput={urlInput}
              setUrlInput={setUrlInput}
              onUrlSubmit={handleUrlSubmit}
              onShowTrackLibrary={() => library.setShowTrackLibrary(true)}
              tracksCount={TRACKS.length}
              taste={ai.taste}
              scenarioAnalysis={ai.scenarioAnalysis}
              reasons={ai.reasons}
              aiInsights={ai.aiInsights}
              onShowExportDialog={() => setShowExportDialog(true)}
            />
          </div>
          {/* EQ controls section */}
          <section className="mt-6 md:mt-8 space-y-6">
            <EQSectionHeader
              profileGenre={profiles.profileGenre}
              profileName={profiles.profileName}
              handleReset={eq.handleReset}
              setSaveNameInput={profiles.setSaveNameInput}
              setShowSaveDialog={profiles.setShowSaveDialog}
            />

            {/* MAIN EQ PANEL - Top Priority */}
            <div className="relative z-20">
              <EQPanel
                bands={eq.bands}
                onBandChange={eq.handleBandChange}
                preAmp={audio.preAmp}
                onPreAmpChange={audio.handlePreAmpChange}
                phaseMode={audio.phaseMode}
                onPhaseModeChange={audio.handlePhaseModeChange}
                dynamicEqMaster={audio.enhancement.dynamicEqMaster}
                onDynamicEqMasterChange={handleDynamicEqMasterChange}
                spectralPeaks={spectralPeaks}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* ─── Sound Enhancement Panel ─── */}
              <EnhancementPanel
                showEnhancement={showEnhancement}
                setShowEnhancement={setShowEnhancement}
                enhancement={audio.enhancement}
                setEnhancement={audio.setEnhancement}
                onEnhancementChange={audio.handleEnhancementChange}
              />

              {/* ─── Adaptive EQ Module ─── */}
              <AdaptiveEQModule
                isAdaptiveMode={adaptive.isAdaptiveMode}
                setIsAdaptiveMode={adaptive.setIsAdaptiveMode}
                stability={aiStatus.stability}
                sectionType={adaptive.sectionType}
                setSectionType={adaptive.setSectionType}
                profileName={profiles.profileName}
              />

              {/* Hearing Protection Indicator */}
              <HearingProtectionIndicator risk={risk} />
            </div>
          </section>

          {/* Footer */}
          <MainAppFooter errorHeader={audio.errorHeader} lastSync={lastSync} />
        </div>

        {/* Hidden audio */}
        <audio
          ref={audio.audioRef}
          src={audio.audioSource || undefined}
          onEnded={() => audio.setIsPlaying(false)}
          onError={audio.handleAudioError}
          preload="auto"
          crossOrigin={audio.audioSource && !audio.audioSource.startsWith('blob:') ? 'anonymous' : undefined}
        />

        <input
          type="file"
          ref={folderInput}
          onChange={library.handleFolderInputChange}
          {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          className="hidden"
        />

        {/* Modals */}
        <AnimatePresence>
          {showRewImport && (
            <RewImport 
              onClose={() => setShowRewImport(false)}
              onApply={(gains: number[]) => {
                const newBands = eq.bands.map((b: any, i: number) => ({ ...b, gain: gains[i] }));
                eq.setBands(newBands);
                audio.applyBandsToEngine(newBands, audio.preAmp);
                eq.history.push(newBands, audio.preAmp, 'REW Measurement Apply');
                eq.debouncedPersist(newBands, audio.preAmp);
              }}
            />
          )}
          {ai.showWizard && (
            <TuningWizard
              learnerState={adaptive.learnerState}
              onComplete={handleTuningComplete}
              onClose={restoreBands}
              onPreviewAB={tuningAB.handlePreviewAB}
              onExitAB={tuningAB.handleExitAB}
              onChoice={adaptive.handleInteraction}
              tracks={
                ai.selectedTrackUrls.length > 0
                  ? ai.selectedTrackUrls.map((u: string) => {
                      const t = library.allTracks.find((x: any) => x.url === u);
                      return { url: u, name: t?.name ?? 'Selected Track' };
                    })
                  : [{ url: audio.audioSource, name: audio.currentTrackName }]
              }
              targetSamples={Math.min(40, 15 + 10 * Math.max(1, ai.selectedTrackUrls.length))}
            />
          )}
        </AnimatePresence>

        {/* Export dialog */}
        <ExportDialog
          open={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          bands={eq.bands}
          preAmp={audio.preAmp}
          defaultName={profiles.profileName || 'Sonic AI Live EQ'}
          defaultGenre={profiles.profileGenre ?? undefined}
          defaultColor={profiles.profileColor}
        />

        <ProfileLibraryModal
          show={profiles.showProfilePanel}
          onClose={() => profiles.setShowProfilePanel(false)}
          savedProfiles={profiles.savedProfiles}
          handleDeleteProfile={profiles.deleteProfile}
          handleLoadProfile={handleLoadProfile}
          exportProfileAsAPO={exportProfileAsAPO}
          importFileRef={importFile}
          importError={profiles.importError}
        />

        <TrackLibraryModal
          show={library.showTrackLibrary}
          onClose={() => library.setShowTrackLibrary(false)}
          selectionMode={ai.selectionMode}
          setSelectionMode={ai.setSelectionMode}
          selectedTrackUrls={ai.selectedTrackUrls}
          setSelectedTrackUrls={ai.setSelectedTrackUrls}
          allTracks={library.allTracks}
          trackSearch={library.trackSearch}
          setTrackSearch={library.setTrackSearch}
          genreFilter={library.genreFilter}
          setGenreFilter={library.setGenreFilter}
          allGenres={library.allGenres}
          handleFolderImport={library.handleFolderImport}
          fileInputRef={fileInput}
          audioSource={audio.audioSource}
          currentTrackName={audio.currentTrackName}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          handleUrlSubmit={handleUrlSubmit}
          isPlaying={audio.isPlaying}
          onConfirmCalibration={() => {
            library.setShowTrackLibrary(false);
            ai.setShowWizard(true);
          }}
          onTrackSelect={(track: any) => {
            if (ai.selectionMode) {
              ai.setSelectedTrackUrls((prev: string[]) => {
                if (prev.includes(track.url)) return prev.filter((u: string) => u !== track.url);
                if (prev.length >= 3) return [...prev.slice(1), track.url];
                return [...prev, track.url];
              });
            } else {
              audio.handleTrackChange(track.url, track.name);
              library.setShowTrackLibrary(false);
            }
          }}
        />

        <SaveProfileModal
          show={profiles.showSaveDialog}
          onClose={() => profiles.setShowSaveDialog(false)}
          saveNameInput={profiles.saveNameInput}
          setSaveNameInput={profiles.setSaveNameInput}
          handleSaveProfileLocal={handleSaveProfileLocal}
          profileName={profiles.profileName}
        />
      </main>
    </AudioEngineProvider>
  );
}
