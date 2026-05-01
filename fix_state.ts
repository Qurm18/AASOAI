import * as fs from 'fs';

let code = fs.readFileSync('components/MainAppView.tsx', 'utf-8');

code = code.replace(/state\.refs\.([a-zA-Z0-9_]+)/g, '$1');
code = code.replace(/state\.([a-zA-Z0-9_]+)/g, '$1');

code = code.replace(
  'export function MainAppView({ audio, eq, ai, profiles, adaptive, tuningAB, aiStatus, library, state }: any) {',
  `export function MainAppView({ audio, eq, ai, profiles, adaptive, tuningAB, aiStatus, library, state }: any) {
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
  const { importFile, fileInput, folderInput } = refs || {};`
);

fs.writeFileSync('components/MainAppView.tsx', code);
console.log('Fixed');
