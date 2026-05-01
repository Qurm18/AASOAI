/**
 * SONIC AI — Phase 5: Advanced EQ Curve Optimization
 */

export interface OptimizeEQConstraints {
  maxGainPerBand: number;      // e.g., ±12 dB
  maxQLeverage: number;        // Q cannot exceed 8
  maxSlopeChange: number;      // dB/octave max change
  smoothnessPenalty: number;   // \u03bb for Laplacian regularization
  perceptualWeighting: number[]; // per-band importance
}

/**
 * 5.1 Constrained Optimization with Perceptual Weighting
 * Replacing the placeholder with a multi-pass gradient-descent like approach.
 */
export function optimizeEQCurveConstrained(
  targetGains: number[],
  constraints: OptimizeEQConstraints
): {
  gains: number[];
  qValues: number[];
  residualError: number;
  converged: boolean;
  iterations: number;
} {
  const n = targetGains.length;
  let currentGains = [...targetGains];
  const qValues = new Array(n).fill(1.5);
  
  const MAX_ITER = 30;
  let iterations = 0;
  let totalError = 0;

  for (iterations = 0; iterations < MAX_ITER; iterations++) {
    let prevGains = [...currentGains];
    totalError = 0;

    for (let i = 0; i < n; i++) {
      // 1. Target Tracking
      const weight = constraints.perceptualWeighting[i] || 1;
      let delta = (targetGains[i] - currentGains[i]) * 0.4 * weight;
      
      // 2. Smoothness / Curvature constraints
      if (i > 0 && i < n - 1) {
        const curvature = currentGains[i-1] - 2 * currentGains[i] + currentGains[i+1];
        delta += curvature * constraints.smoothnessPenalty;
      }

      currentGains[i] += delta;

      // 3. Hard Bound Constraints
      currentGains[i] = Math.max(-constraints.maxGainPerBand, Math.min(constraints.maxGainPerBand, currentGains[i]));
      
      totalError += Math.abs(currentGains[i] - targetGains[i]);
    }

    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
       maxDiff = Math.max(maxDiff, Math.abs(currentGains[i] - prevGains[i]));
    }
    if (maxDiff < 0.01) break;
  }

  // Final Slope mapping to Q values (heuristic mapping)
  for (let i = 0; i < n - 1; i++) {
    const slope = Math.abs(currentGains[i] - currentGains[i + 1]);
    const normalizedSlope = slope / 6; // relative to 6dB step
    qValues[i] = Math.min(constraints.maxQLeverage, 0.7 * (1 + normalizedSlope));
  }

  return {
    gains: currentGains.map(g => Number(g.toFixed(2))),
    qValues: qValues.map(q => Number(q.toFixed(2))),
    residualError: Number(totalError.toFixed(3)),
    converged: iterations < MAX_ITER,
    iterations
  };
}

/**
 * 5.2 Tonality-Aware Dynamic Q Computation
 */
export function dynamicQAdvanced(
  frequency: number,
  gainDb: number,
  neighboringFreqs: number[],
  spectrogram: Float32Array,  // recent STFT data
  tonality: 'tonal' | 'noise' | 'mixed'
): number {
  let q = 1.414; // Default Q

  // Rule 1: Tonal content + high SNR => narrow Q (surgical notching)
  if (tonality === 'tonal' && gainDb < 0) {
    q = 4.0; 
  } else if (tonality === 'tonal' && gainDb > 0) {
    q = 2.0; // Surgical boost
  }

  // Rule 2: Noisy content => wide Q (broad smoothing)
  if (tonality === 'noise') {
    q = 0.7;
  }

  // Rule 3: If high-frequency tail (8+ kHz) => reduce Q (natural roll-off)
  if (frequency >= 8000) {
    q *= 0.5;
  }

  return Math.min(8.0, Math.max(0.1, q));
}

/**
 * 6.2 Time-Stretching Aware EQ (Tempo Adaptive)
 */
export function tempoAdaptiveEQ(
  bpm: number,
  musicalContext: 'drums' | 'bass' | 'vocals' | 'synth'
): {
  gainAdjustments: number[];  // per-band delta dB
  qAdjustments: number[];     // per-band delta Q
} {
  const gainAdjustments = new Array(10).fill(0);
  const qAdjustments = new Array(10).fill(0);

  if (bpm < 90) {
    // Slower tempos: Reduce low mids to avoid mud, boost presence
    gainAdjustments[3] -= 1.5; // ~250 Hz
    gainAdjustments[6] += 1.0; // ~2 kHz
  } else if (bpm > 130) {
    // Faster tempos: Boost sub-bass for impact, reduce presence slightly
    gainAdjustments[0] += 2.0; // Sub
    gainAdjustments[6] -= 0.5; // Presence
  }

  switch (musicalContext) {
    case 'drums':
      gainAdjustments[8] += 1.5; // Transient definition
      break;
    case 'bass':
      gainAdjustments[2] += 1.5; // Warm up low-mids (~125 Hz)
      break;
    case 'vocals':
      gainAdjustments[7] += 1.0; // Clarity
      gainAdjustments[9] -= 1.5; // Sibilance reduction (~8-16kHz)
      break;
    case 'synth':
      qAdjustments.fill(-0.2); // Let it breathe (narrow Q)
      break;
  }

  return { gainAdjustments, qAdjustments };
}
