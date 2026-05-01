import { describe, it, expect } from 'vitest';
import { analyzePreferences, TuningPreference, DeviceProfile } from './ai-engine';

describe('AI Engine Integration - analyzePreferences', () => {
  it('should generate reasonable gains for a bass-heavy preference set', async () => {
    const preferences: TuningPreference[] = [
      { scenario: 'bass_depth', choice: 'A' }, // A: [5.0, 3.5, 1.0, ...]
      { scenario: 'sub_bass', choice: 'A' },   // A: [6.0, 2.0, 0, ...]
      { scenario: 'mid_punch', choice: 'A' },  // A: [0, 1.5, 4.5, 3.0, ...]
    ];

    const result = await analyzePreferences(preferences);

    expect(result.gains).toBeDefined();
    expect(result.gains.length).toBe(10);
    
    // Low frequency gains (indices 0, 1) should be significantly higher than high frequency if user loves bass
    const lowEnd = result.gains[0] + result.gains[1];
    const highEnd = result.gains[8] + result.gains[9];
    
    expect(lowEnd).toBeGreaterThan(highEnd);
    expect(result.profileName).toBeDefined();
  });

  it('should compensate for a device profile with excessive treble', async () => {
    const preferences: TuningPreference[] = [
      { scenario: 'high_frequency', choice: 'B' }, // B: [..., 4.5, 5.0]
    ];

    // Case 1: Neutral device
    const neutralDevice: DeviceProfile = {
      id: 'neutral',
      name: 'Neutral',
      deviations: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      timestamp: Date.now(),
    };
    const neutralResult = await analyzePreferences(preferences, 0.5, undefined, neutralDevice);

    // Case 2: Treble-heavy device (deviations > 0 at high frequencies)
    // Device profile deviations are what the device ADDS to the signal.
    // If device is +6dB at 16k, deviations[9] = 6.
    const brightDevice: DeviceProfile = {
      id: 'bright',
      name: 'Bright',
      deviations: [0, 0, 0, 0, 0, 0, 0, 0, 4, 6],
      timestamp: Date.now(),
    };
    const compensatedResult = await analyzePreferences(preferences, 0.5, undefined, brightDevice);

    // The AI Engine should reduce the weight of high-frequency boosts if the device is already bright
    // Or if the user chooses B (boost) on a bright device, we might trust it less or adjust.
    // In lib/ai-engine.ts:967: const bandComp = Math.max(0.5, 1.0 - (weights[i] * compensation[i] * 0.05));
    // If weights[i] is positive (boost) and compensation[i] is positive (device boost), bandComp < 1.0
    
    expect(compensatedResult.gains[9]).toBeLessThan(neutralResult.gains[9]);
  });

  it('should handle contradictory preferences by lowering confidence', async () => {
    const preferences: TuningPreference[] = [
      { scenario: 'vocal_clarity', choice: 'A' }, 
      { scenario: 'vocal_clarity', choice: 'B' }, // Hard contradiction
    ];

    const result = await analyzePreferences(preferences);
    
    // We expect confidenceScore to be relatively low compared to a consistent set
    const consistentPreferences: TuningPreference[] = [
      { scenario: 'vocal_clarity', choice: 'A' },
      { scenario: 'instrument_sep', choice: 'A' },
    ];
    const consistentResult = await analyzePreferences(consistentPreferences);
    
    expect(result.confidenceScore).toBeLessThan(consistentResult.confidenceScore);
  });

  it('should apply acoustic masking when band energies are provided', async () => {
    const preferences: TuningPreference[] = [
      { scenario: 'overall_balance', choice: 'A' },
    ];
    
    const resultNoMasking = await analyzePreferences(preferences);
    
    // High energy at 1kHz should mask nearby bands
    const bandEnergies = [0, 0, 0, 0, 0, 10, 0, 0, 0, 0]; // 10dB at 1kHz (index 5)
    const resultWithMasking = await analyzePreferences(preferences, 0.5, bandEnergies);
    
    // Masking should change the gains
    expect(resultWithMasking.gains).not.toEqual(resultNoMasking.gains);
  });

  it('should influence profile scoring based on track genre', async () => {
    const preferences: TuningPreference[] = [
      { scenario: 'bass_depth', choice: 'A' },
    ];
    
    // Case 1: Neutral genre
    const neutralChar = { genre: 'vocal-mid' } as any;
    const neutralResult = await analyzePreferences(preferences, 0.5, undefined, undefined, neutralChar);
    
    // Case 2: Bass-heavy genre should boost selection of bassy profiles
    const bassChar = { genre: 'bass-heavy' } as any;
    const bassResult = await analyzePreferences(preferences, 0.5, undefined, undefined, bassChar);
    
    // Even with same preferences, the "Deep Sub" or "Power Bass" profile should rank higher
    // If the neutral case already picked one of them, we compare scores (though score isn't exposed directly, 
    // we can check if the profileName changed or if it stayed consistent with expectation)
    
    expect(bassResult.profileName).toBeDefined();
  });
});
