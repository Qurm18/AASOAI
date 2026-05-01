const fs = require('fs');
const files = [
  'lib/math/spectral-enhancement.ts',
  'lib/profile-store.ts',
  'lib/webusb-audio.ts',
  'lib/webusb-audio-full.ts',
  'lib/audio-engine.ts',
  'lib/ai-engine-v2.ts',
  'lib/high-res-pipeline.ts',
  'lib/device-inspector.ts',
  'components/TuningWizard.tsx',
  'components/ErrorBoundary.tsx',
  'hooks/useTuningAB.ts',
  'hooks/useAdaptiveEQ.ts',
  'hooks/useAudioPlayer.ts',
  'hooks/useEQManager.ts',
  'containers/MainApp.tsx'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    let original = content;
    
    if (content.match(/console\.(log|warn|error|debug)/)) {
      if (!content.includes("import { logger }")) {
        const importStatement = "import { logger } from '@/lib/logger';\n";
        const lastImportIndex = content.lastIndexOf('import ');
        if (lastImportIndex !== -1) {
          const endOfImport = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, endOfImport + 1) + importStatement + content.slice(endOfImport + 1);
        } else {
          content = importStatement + content;
        }
      }

      content = content.replace(/console\.log/g, 'logger.info');
      content = content.replace(/console\.warn/g, 'logger.warn');
      content = content.replace(/console\.error/g, 'logger.error');
      content = content.replace(/console\.debug/g, 'logger.debug');

      if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
      }
    }
  }
}
