/**
 * SONIC AI — Phase 7: Real-Time Measurement & Adaptation
 */

export interface RealTimeMetrics {
  spectralCentroid: number;        // Hz
  spectralSpread: number;          // Hz
  spectralSkewness: number;        // -1 to +1 (\u2212=bass heavy, +=bright)
  zerocrossingRate: number;        // 0\u20130.5, indicates noisiness
  tempoProbability: number[];      // [80, 120, 140] BPM confidence
  onsetStrength: number;           // 0\u20131: transient activity
  harmonicContent: number;         // 0\u20131: vs. noise
}

/**
 * 7.1 Spectral Centroid + Zero Crossing Rate Tracking
 */
export function updateMetricsRealtime(
  timeDomain: Float32Array,
  stftMagnitudes: Float32Array,
  sampleRate: number,
  previousMetrics: RealTimeMetrics
): RealTimeMetrics {
  const decay = 0.97;
  
  // 1. Zero Crossing Rate
  let zcr = 0;
  for (let i = 1; i < timeDomain.length; i++) {
    if ((timeDomain[i] > 0 && timeDomain[i - 1] < 0) || 
        (timeDomain[i] < 0 && timeDomain[i - 1] > 0)) {
      zcr++;
    }
  }
  zcr = zcr / timeDomain.length;

  // 2. Spectral Centroid
  let weightedSum = 0;
  let totalPower = 0;
  for (let i = 0; i < stftMagnitudes.length; i++) {
    const f = (i * sampleRate) / (stftMagnitudes.length * 2);
    weightedSum += f * stftMagnitudes[i];
    totalPower += stftMagnitudes[i];
  }
  const centroid = totalPower > 0 ? weightedSum / totalPower : 2000;

  // EMA Update
  return {
    ...previousMetrics,
    spectralCentroid: previousMetrics.spectralCentroid * decay + centroid * (1 - decay),
    zerocrossingRate: previousMetrics.zerocrossingRate * decay + zcr * (1 - decay),
    onsetStrength: calculateOnsetStrength(timeDomain, previousMetrics.onsetStrength),
  };
}

/**
 * Helper to estimate transient activity
 */
function calculateOnsetStrength(timeDomain: Float32Array, current: number): number {
  let rms = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    rms += timeDomain[i] * timeDomain[i];
  }
  rms = Math.sqrt(rms / timeDomain.length);
  
  // High-pass behavior to detect rapid changes (very simplified)
  // We use the variance of the RMS as a proxy for transients in this bucket
  const onset = Math.min(1.0, rms * 10); 
  return current * 0.8 + onset * 0.2;
}

/**
 * 7.2 Automatic Profile Recommendation Engine
 */
export function recommendProfileAuto(
  metrics: RealTimeMetrics,
  preferences: Array<{ name: string; contextData?: any }>
): {
  profiles: Array<{ name: string; match: number; }>;
  reasoning: string;
  alternativeCount: number;
} {
  const isVocalForward = metrics.spectralCentroid > 2000 && metrics.spectralCentroid < 4000;
  const isBassHeavy = metrics.spectralCentroid < 800;
  const isNoisy = metrics.zerocrossingRate > 0.2;

  let rankedProfiles = preferences.map(p => {
    let score = 0.5; // Base score
    const name = p.name.toLowerCase();

    if (isBassHeavy && (name.includes('bass') || name.includes('edm'))) score += 0.4;
    if (isVocalForward && (name.includes('vocal') || name.includes('acoustic'))) score += 0.4;
    if (isNoisy && (name.includes('flat') || name.includes('soft'))) score += 0.3;
    if (metrics.onsetStrength > 0.3 && (name.includes('dynamic') || name.includes('rock'))) score += 0.2;

    return {
      name: p.name,
      match: Math.min(0.99, score + (Math.random() * 0.05)) // Subtle jitter for UI feel
    };
  });

  rankedProfiles.sort((a, b) => b.match - a.match);

  let reasoning = "Phân tích đặc tính âm học của track hiện tại...";
  if (isVocalForward) {
    reasoning = "Năng lượng tập trung ở dải trung âm (2kHz-4kHz), dấu hiệu của Vocal. Gợi ý tăng độ rõ nét.";
  } else if (isBassHeavy) {
    reasoning = "Năng lượng tập trung cực mạnh ở dải trầm (<800Hz). Gợi ý tăng cường độ sâu.";
  } else if (isNoisy) {
    reasoning = "Track có độ nhiễu cao hoặc nhiều tiếng xì (ZCR cao). Gợi ý dùng bộ lọc làm mềm.";
  }

  return {
    profiles: rankedProfiles.slice(0, 3),
    reasoning,
    alternativeCount: preferences.length - 3
  };
}
