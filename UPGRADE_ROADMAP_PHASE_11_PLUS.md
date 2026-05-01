# SONIC AI — Roadmap Phase 11+ (Advanced Algorithm & Software Enhancements)

**Ngày cập nhật:** 2026-05-01  
**Trạng thái:** Planning & Development Roadmap  
**Phiên bản hiện tại:** Post-Phase 10 (Core DSP Complete)

---

## 📋 Tổng quan Phase 11+

Sau khi hoàn thành 10 phase với các thuật toán DSP/AI cơ bản, Phase 11+ tập trung vào:
1. **Nâng cấp thuật toán hiện có** (tối ưu hóa hiệu năng, độ chính xác)
2. **Các thuật toán mới tiên tiến** (Machine Learning, Neural Networks)
3. **Cải tiến UX/Performance** (WebWorkers, GPU acceleration)
4. **Interoperability & Integration** (VST plugins, DAW integration)

---

## Phase 11: Neural Network-based EQ Curve Prediction

### 🎯 Mục tiêu
Thay thế polynomial regression bằng một mạng neural nhẹ để dự đoán đường cong EQ tối ưu từ:
- Tính chất phổ nhạc (spectral fingerprint)
- Sở thích người dùng (user preferences history)
- Thể loại nhạc (music genre classification)

### 🔧 Thuật toán & Công nghệ

#### 11.1: Lightweight TensorFlow.js Model
**File:** `lib/ml/eq-predictor-nn.ts`

```typescript
// Mô hình CNN-Encoder nhẹ
- Input: 256D spectral features (log-power spectrum)
- Encoder: 2 × Conv1D (32 filters, kernel=3)
- Bottleneck: Dense (64 units) + Dropout(0.2)
- Output: 10D (10-band EQ gains) + 10D (Q factors)
- Model Size: ~200KB (TensorFlow.js format)
- Training: Transfer learning từ synthetic EQ dataset
```

**Chính sách:**
- Model được quantize để chạy trên browser, latency < 50ms
- Offline training sử dụng WebWorker, không block main thread
- Cache predictions để tái sử dụng

#### 11.2: Preference-Conditioned Generation
**File:** `lib/ml/preference-encoder.ts`

```
User Profile Encoder:
- Lịch sử 100 EQ settings cuối cùng → Embedding (32D)
- Genre classifier output → Embedding (16D)
- Loudness preference → 1D scalar
- → Concatenate → Dense → Bias vector (10D) áp dụng vào NN output
```

#### 11.3: Reinforcement Learning Fine-tuning
**File:** `lib/ml/rl-eq-feedback.ts`

```
State: (Spectral features, Current EQ, User history)
Action: ΔEQ (change in each of 10 bands)
Reward: 
  - User gives 👍/👎 after A/B preview
  - +1 for 👍, -0.5 for 👎
  - Penalty for extreme gains (>12dB per band)
Agent: DQN (Deep Q-Network) simplified, 1 hidden layer
Training: Online incremental learning
```

### 📊 Metrics & Validation
- **Prediction accuracy:** Mean Absolute Error (MAE) < 1.5dB vs user's manual tuning
- **Inference time:** < 50ms per prediction
- **Model size:** < 250KB
- **Success rate:** 70%+ users find predictions satisfactory in A/B test

### 🗓️ Timeline: 4-6 tuần

---

## Phase 12: Advanced Music Genre & Mood Classification

### 🎯 Mục tiêu
Tự động phát hiện thể loại nhạc, tâm trạng (mood), và năng lượng bài hát để gợi ý EQ phù hợp.

### 🔧 Thuật toán & Công nghệ

#### 12.1: Real-time Genre Classifier
**File:** `lib/ml/genre-classifier.ts`

```typescript
// MobileNet-inspired architecture
Input features (per 512ms frame):
  - Spectral Centroid, Rolloff, Bandwidth (3D)
  - MFCCs (13 coefficients)
  - Zero Crossing Rate (1D)
  - Temporal energy envelope (4D statistics)
  - Chroma features (12D)
  Total: ~35D feature vector

Model: 2-layer LSTM + Dense classifier
  - LSTM (64 units) × 2
  - Dropout(0.3)
  - Output: 10 genres (softmax)
  - Framerate: 1 prediction / 512ms (21 FPS)

Genres:
  1. Classical
  2. Jazz
  3. Pop
  4. Rock
  5. Electronic/EDM
  6. Hip-Hop/Rap
  7. Metal
  8. Country
  9. R&B/Soul
  10. Ambient/Experimental
```

#### 12.2: Mood/Energy Estimation
**File:** `lib/ml/mood-energy.ts`

```
Valence (Positive ↔ Negative):
  - Based on: Major/minor chord detection, brightness (spectral centroid)
  - Range: [-1, +1]

Energy (Calm ↔ Intense):
  - Based on: RMS energy, spectral flux, tempo estimation
  - Range: [0, 1]

Tempo Estimation (BPM):
  - Onset detection + autocorrelation on energy envelope
  - Range: 60-200 BPM typical

Output: (Valence, Energy, BPM) tuple
```

#### 12.3: EQ Profile Library
**File:** `lib/ml/genre-eq-profiles.json`

```json
{
  "classical": {
    "description": "Warm, detailed highs, controlled lows",
    "eqCurve": [0, -2, -1, 0, 1, 2, 3, 2, 1, -1],
    "q": [0.7, 0.7, 0.8, 0.9, 0.9, 1.0, 1.2, 1.1, 0.9, 0.7]
  },
  "edm": {
    "description": "Punchy bass, bright mids, sparkling highs",
    "eqCurve": [3, 2, -1, -2, 0, 1, 2, 3, 2, 1],
    "q": [1.5, 1.3, 0.8, 0.7, 0.8, 1.0, 1.2, 1.3, 1.1, 0.9]
  }
  // ... 8 profile khác
}
```

### 📊 Metrics
- **Genre accuracy:** 80%+ on test dataset (1000+ tracks)
- **Mood detection:** Correlation > 0.75 with human ratings
- **Latency:** < 200ms for full analysis
- **User satisfaction:** 75%+ find recommendations helpful

### 🗓️ Timeline: 3-4 tuần

---

## Phase 13: Convolution-based Room Acoustics Modeling

### 🎯 Mục tiêu
Mô phỏng phản xạ âm trong phòng (room impulse response) để điều chỉnh EQ phù hợp với không gian nghe.

### 🔧 Thuật toán & Công nghệ

#### 13.1: Simplified Room Impulse Response (RIR) Generator
**File:** `lib/audio/room-acoustics.ts`

```typescript
// Mô phỏng EarlyReflections + Reverberation

Input:
  - Room dimensions (L, W, H) meters
  - Material absorption coefficients (250Hz-8kHz octave bands)
  - Microphone/source position

Early reflections (specular):
  - 1st-4th order reflections via image source method
  - Attenuation = absorption^distance_ratio

Late reverberation (diffuse):
  - Schroeder's statistical model
  - T60 calculation from Sabine equation: T60 = 0.161 × Volume / (Absorption_area)

Output: 
  - RIR impulse response (32K samples @ 48kHz = ~0.67s)
  - Frequency response plot (for visualization)

Linear convolution:
  - Partition convolution (Block size: 512 samples)
  - Complexity: O(N log N) via FFT instead of O(N²) direct convolution
```

#### 13.2: Room Calibration from User Input
**File:** `lib/audio/room-calibration.ts`

```
User Interface:
1. Specify room type (living room, studio, bedroom, outdoor)
2. Estimate room size (meter range slider)
3. Indicate wall materials (carpet, drywall, concrete, glass)
4. Choose listening position

Presets:
  - Small Bedroom (3×4×2.5m, carpet + drywall)
  - Living Room (5×6×2.8m, mixed)
  - Recording Studio (4×5×3m, acoustic foam)
  - Outdoor (flat response, minimal reflections)

Output: 
  - Predicted room characteristics
  - Suggested EQ compensation
  - RIR for convolution
```

#### 13.3: Measurement via Sine Sweep (Optional)
**File:** `lib/audio/room-measurement.ts`

```
Advanced calibration using audio loopback:
1. Generate 20Hz-20kHz log-sweep (~10s)
2. Play via speakers, record via microphone
3. Deconvolve: Recorded ÷ Original → RIR
4. Analyze frequency response
5. Suggest EQ correction

Requires: Microphone + Speaker setup (optional feature)
```

### 📊 Metrics
- **Subjective room modeling:** User rating > 3.5/5 for recommendations
- **RIR synthesis time:** < 100ms
- **Convolution latency:** < 20ms @ 48kHz
- **Perceptual accuracy:** Blind A/B test scores correlate with room model

### 🗓️ Timeline: 5-6 tuần

---

## Phase 14: GPU-accelerated FFT & Spectrogram Analysis (WebGPU)

### 🎯 Mục tiêu
Tăng tốc độ xử lý FFT, convolution, và real-time visualization bằng WebGPU (computación on GPU).

### 🔧 Thuật toán & Công nghệ

#### 14.1: WebGPU Compute Shader FFT
**File:** `lib/gpu/fft-webgpu.ts`

```wgsl
// WGSL (WebGPU Shading Language)

@compute @workgroup_size(256)
fn radix2_fft(
    @builtin(global_invocation_id) global_id: vec3<u32>
) {
    let idx = global_id.x;
    // Cooley-Tukey FFT butterfly operations parallelized
    // Each GPU thread computes 1 butterfly stage
    // 8192-point FFT: log2(8192)=13 stages, all parallel
}

Performance:
  - CPU FFT (Cooley-Tukey): ~5ms for 8192-point @ 48kHz
  - GPU FFT: ~0.3-0.5ms (10-15x speedup)
  - Memory bandwidth: GPU excels at parallel I/O
```

#### 14.2: Real-time Spectrogram on Canvas (GPU rendering)
**File:** `lib/gpu/spectrogram-renderer.ts`

```
Texture-based approach:
  - Store 512 consecutive FFT outputs as rows in 2D texture
  - Color mapping via compute shader (frequency → hue, magnitude → brightness)
  - WebCanvas GPU rendering pipeline
  - 60 FPS maintained even with 8192-point FFT per frame

Benefits:
  - CPU-main-thread fully unblocked
  - Smooth real-time visualization
  - Low power consumption
```

#### 14.3: Convolution & Filtering on GPU
**File:** `lib/gpu/convolution-webgpu.ts`

```
Room acoustic convolution:
  - Audio buffer → GPU texture
  - RIR kernel → Constant buffer
  - Partition-based convolution via GPU
  - Output: Real-time convolved audio stream

Latency: ~15ms (incl. GPU<->CPU transfer)
```

### 📊 Metrics
- **Speedup:** 10-15x for FFT, 8-10x for convolution vs CPU
- **Power consumption:** 30-40% reduction on battery
- **Visualization:** Constant 60 FPS without frame drops
- **Browser support:** Chrome 113+, Firefox 116+, Safari 17.2+ (WebGPU stabilization)

### 🗓️ Timeline: 4-5 tuần

---

## Phase 15: Attention-based A/B Preference Learning

### 🎯 Mục tiêu
Xây dựng một mô hình Transformer nhẹ để học các mẫu sở thích phức tạp từ lịch sử A/B comparisons.

### 🔧 Thuật toán & Công nghệ

#### 15.1: Transformer-based Preference Encoder
**File:** `lib/ml/transformer-preference.ts`

```typescript
// Lightweight Transformer (inspired by DistilBERT, but for audio)

Input sequence:
  - Last 50 A/B comparisons
  - Each comparison: (EQ_A, EQ_B, UserChoice, Timestamp, Genre)
  - Embed each EQ as 10D vector (10 bands)

Transformer stack:
  - 2 encoder layers
  - Head count: 4
  - Hidden dim: 64
  - Position-wise FFN: 128 → 64
  - Dropout: 0.1

Attention mechanism:
  - Multi-head self-attention on historical comparisons
  - Learns: "When user prefers bright EQ? Cold genres? Morning/evening?"
  - Output: Context vector summarizing user's preference trajectory

Output:
  - Prediction of which EQ (from new candidates) user will prefer
  - Confidence score [0, 1]
```

#### 15.2: Online Learning / Continual Adaptation
**File:** `lib/ml/continual-learning.ts`

```
Instead of batch retraining:
  - Incremental gradient updates (Adam optimizer)
  - New A/B result → Backprop → Update weights (few iterations)
  - Running mean/std of EQ preferences
  - Exponential moving average of recent choices (decay = 0.95)

Benefit: Model adapts to user's evolving taste within minutes
Trade-off: Catastrophic forgetting mitigated via rehearsal buffer (store 10% old samples)
```

#### 15.3: Preference Consistency Scoring
**File:** `lib/ml/preference-consistency.ts`

```
Detect contradictions:
  - User preferred "Bright+Bass" last week
  - This week prefers "Warm+Mellow"
  - Score inconsistency → Alert user or suggest reason

Coherence metrics:
  - Mutual Information between preference features
  - Correlation of genre-based choices
  - Temporal smoothness (penalize erratic swings)

Use case:
  - Warn if A/B session might be fatiguing (inconsistent results)
  - Suggest taking a break
```

### 📊 Metrics
- **Prediction accuracy:** 75%+ on held-out A/B test set
- **Convergence time:** Model adapts to new preference pattern within 20-30 interactions
- **Model size:** ~100KB (TensorFlow.js quantized)
- **Inference latency:** < 20ms
- **User retention:** 20%+ improvement in session engagement (measured via A/B)

### 🗓️ Timeline: 4-5 tuần

---

## Phase 16: Advanced Voice & Speech Enhancement Algorithms

### 🎯 Mục tiêu
Thêm các tính năng enhance cho voice/speech: Noise Suppression, Intelligibility Boost, Voice Isolation.

### 🔧 Thuật toán & Công nghệ

#### 16.1: Spectral Subtraction for Noise Suppression
**File:** `lib/audio/noise-suppression.ts`

```typescript
// Real-time noise gate + spectral subtraction

Noise profile estimation:
  - Analyze first 0.5s of audio (assumed silent/noise-only)
  - Compute power spectrum (Welch's method)
  - Store as reference

Per-frame processing:
  1. Compute current frame spectrum
  2. Subtract α × noise_spectrum (α = 1.0 to 1.5, adaptive)
  3. Floor: max(X_clean, β × noise_spectrum) to avoid over-subtraction
  4. Inverse FFT → Output audio

Parameters:
  - Noise_floor: -40dB default, adjustable
  - Aggression: 0.5-2.0 (higher = more aggressive suppression)
  - Smoothing factor: 0.97 (temporal smoothing to reduce artifacts)

Latency: ~20ms (overlap-add processing)
```

#### 16.2: Intelligibility Boost (Clarity Enhancement)
**File:** `lib/audio/intelligibility-boost.ts`

```
Speech intelligibility depends on:
  1. 0.5-4kHz range (formant frequencies)
  2. Dynamic range within speech band
  3. Signal-to-noise ratio

Enhancement strategy:
  - Identify speech activity (VAD: Voice Activity Detection)
  - Compress 500Hz-4kHz band (ratio 4:1, knee 6dB)
  - Gentle peak limiting above 4kHz to prevent sibilance
  - Parallel compression: 30% of compressed + 70% dry (preserve naturalness)

Result:
  - Speech becomes clearer without sounding robotic
  - Microphone recordings sound more professional
```

#### 16.3: Source Separation (Voice Isolation)
**File:** `lib/audio/voice-isolation.ts`

```
Extend existing HPSS algorithm:
  - Current: Harmonic (vocal, synths) vs Percussive (drums, transients)
  - New: Further decompose Harmonic into:
    * Vocal (0.5-2kHz median, vibrato artifacts)
    * Lead Instruments (higher frequency content)
    * Accompaniment (background chords)

Method: 
  - HPSS decomposition
  - Apply pitch detection (autocorrelation) on harmonic part
  - Cluster frequencies within ±2 semitones of fundamental
  - Extract as isolated vocal component

Use case:
  - "Vocals only" mix for sing-along
  - "Karaoke mode" (remove vocals from original)
  - Isolation for analysis/education
```

### 📊 Metrics
- **Noise suppression:** -6 to -12dB SNR improvement (subjective test)
- **Intelligibility score:** PESQ (Perceptual Evaluation of Speech Quality) > 3.5
- **Voice isolation accuracy:** 70%+ separation (measured via spectrogram visual inspection)
- **Latency:** < 50ms total for all three processes

### 🗓️ Timeline: 5-6 tuần

---

## Phase 17: VST/AU Plugin Wrapper & DAW Integration

### 🎯 Mục tiêu
Cho phép SONIC AI hoạt động như một plugin trong DAW (Ableton, Logic Pro, Reaper, v.v.).

### 🔧 Công nghệ & Cấu trúc

#### 17.1: JUCE Framework Integration
**File:** `juce/SonicAI_Plugin/Source/`

```cpp
// JUCE 7.x C++ framework

class SonicAIAudioProcessor : public juce::AudioProcessor {
    void prepareToPlay(int samplesPerBlock, double sampleRate) override;
    void processBlock(juce::AudioBuffer<float>& buffer, 
                      juce::MidiBuffer& midiMessages) override;
    void releaseResources() override;
    
    // WebView embedded for complex UI
    void createPluginGUI();
};

// Wrapper for both VST3 (Windows/Linux/Mac) & AU (Mac only)
```

#### 17.2: WebView-based GUI
**File:** `juce/SonicAI_Plugin/Resources/index.html`

```html
<!-- Reuse React/TypeScript UI from main app -->
<!-- WebView communicates with JUCE backend via message passing -->

Benefits:
  - Consistent UI across VST3 and AU
  - Hot-reload for development
  - No need to rewrite UI in separate framework
```

#### 17.3: State Management & Preset System
**File:** `juce/SonicAI_Plugin/Presets/`

```json
{
  "version": "1.0",
  "pluginName": "SonicAI",
  "parameters": {
    "eq_band_0": -1.5,
    "eq_band_1": 0.0,
    // ... all 10 bands
    "mode": "manual", // or "auto-genre", "learning"
    "room_acoustics_enabled": true
  },
  "automationPoints": [
    { "time": 5.0, "band": 3, "value": 2.5 },
    // Automation clips for DAW timeline
  ]
}
```

#### 17.4: Real-time Audio Processing Pipeline
**File:** `juce/SonicAI_Plugin/Source/DSPCore.cpp`

```cpp
void SonicAIAudioProcessor::processBlock(
    juce::AudioBuffer<float>& buffer,
    juce::MidiBuffer& midiMessages
) {
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();
    
    // 1. Update parameters from DAW automation
    updateParametersFromDAW();
    
    // 2. Apply EQ (linear-phase FIR or Biquad cascade)
    for (int ch = 0; ch < numChannels; ++ch) {
        applyEQFilter(buffer.getWritePointer(ch), numSamples);
    }
    
    // 3. Apply room acoustics convolution (if enabled)
    if (roomAcousticsEnabled)
        applyRoomConvolution(buffer);
    
    // 4. Analyze and send spectral data to WebView (for visualization)
    updateSpectralAnalysis(buffer);
    
    // 5. Soft-limiting to prevent clipping
    applyLimiter(buffer);
}
```

### 📊 Metrics & Deliverables
- **Plugin format:** VST3 (Windows/Mac/Linux), AU (Mac)
- **GUI latency:** < 50ms round-trip (DAW parameter ↔ Plugin)
- **DSP latency:** < 10ms (at 512 sample buffer, 48kHz)
- **CPU usage:** < 5% single-thread (measured on i7-8700K)
- **Preset management:** Save/load 50+ presets
- **Compatibility:** Tested on 5+ major DAWs

### 🗓️ Timeline: 8-10 tuần (complex integration & testing)

---

## Phase 18: Collaborative Mixing & Cloud Sync

### 🎯 Mục tiêu
Cho phép người dùng chia sẻ EQ presets, so sánh tuning, đồng bộ hóa trên nhiều thiết bị.

### 🔧 Công nghệ & Cấu trúc

#### 18.1: Cloud Backend (Node.js/Express + PostgreSQL)
**File:** `backend/server.ts`

```typescript
// RESTful API endpoints

POST /api/presets/save
  - User saves current EQ tuning to cloud
  - Schema: { userId, presetName, eqCurve, genre, description, createdAt }

GET /api/presets/explore?genre=jazz
  - Browse community presets by genre
  - Pagination: 20 per page

POST /api/presets/:presetId/rate
  - User rates preset (1-5 stars)
  - Aggregate rating algorithm (Bayesian average)

GET /api/presets/sync?devices=[phone,laptop,desktop]
  - Fetch all user's presets across devices
  - Last-modified timestamp for conflict resolution

GET /api/trending?timeframe=week
  - Trending presets in community
  - Metric: (ratings + downloads) / max_possible
```

#### 18.2: P2P Preset Sharing (WebRTC)
**File:** `lib/p2p/preset-sharing.ts`

```typescript
// Direct peer-to-peer sharing without server intermediary

1. User A generates share code (QR code) for preset
2. User B scans QR → initiates WebRTC connection
3. Data Connection established → Preset binary transfer
4. User B receives preset instantly (no cloud latency)

Benefits:
  - Privacy (preset data never touches server)
  - Offline capability
  - Instant transfer (LAN speed ~10-50Mbps)

Fallback: If WebRTC fails → Cloud relay (slower but reliable)
```

#### 18.3: A/B Comparison & Voting
**File:** `lib/social/ab-voting.ts`

```typescript
// Community-driven preset improvement

Community Challenge:
  - Creator posts 2 preset versions
  - Users vote which they prefer (anonymous)
  - Real-time vote tally displayed
  - Winner determined after 7 days

Voting algorithm:
  - Bradley-Terry pairwise comparison model
  - Probability(A preferred over B) modeled via strength parameters
  - Iterative EM algorithm to estimate true preference ordering
  - Output: Ranked list of preset quality scores
```

#### 18.4: Cross-device Synchronization
**File:** `lib/sync/cloud-sync.ts`

```
Conflict resolution strategy:
  - Each preset has version_id (timestamp + device_id)
  - If both desktop & phone modify same preset:
    * Detect conflict (different version_ids)
    * Show user 3-way merge UI (original, version1, version2)
    * User selects which EQ curve to keep (or manually merge)
  
  - Atomic write: All 10 EQ bands written together
  - Last-write-wins timeout: 30 seconds to prevent race conditions
```

### 📊 Metrics & Features
- **API response latency:** < 200ms (P50), < 500ms (P95)
- **Cloud storage:** 1GB per user (~ 10,000 presets)
- **Community presets:** 100,000+ by month 12
- **Average rating:** > 4.2/5 (Bayesian averaged)
- **Sharing success:** 95%+ (P2P + cloud fallback)

### 🗓️ Timeline: 6-8 tuần

---

## Phase 19: Machine Learning-based Hearing Profile Assessment

### 🎯 Mục tiêu
Phát triển audiometric-inspired hearing test để tạo profil nghe cá nhân, phát hiện sự suy giảm thính lực.

### 🔧 Thuật toán & Công nghệ

#### 19.1: Automated Pure-Tone Audiometry
**File:** `lib/hearing/audiometry-test.ts`

```typescript
// Simulate clinical audiometric testing

Test protocol:
  1. Generate pure tones at 6 frequencies: 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz
  2. Present at varying dB levels: -10dB to +40dB SPL (reference: 20μPa)
  3. User indicates when they hear tone (spacebar press)
  4. Adaptive staircase: 
     - If heard: decrease dB by 2dB (harder)
     - If not heard: increase dB by 2dB (louder)
     - Stop after 3 reversals per frequency
  5. Threshold = average of last 3 reversal levels

Duration: ~10 min per ear (left/right separately)

Output:
  - Audiogram: Hearing threshold vs frequency
  - Comparison to age-matched normative data (ISO 8253)
  - Indication of sensorineural vs conductive loss
```

#### 19.2: Individual Equal Loudness Contours
**File:** `lib/hearing/loudness-contours-adaptive.ts`

```
Standard ISO 226 assumes average population.
New: Adapt to individual hearing thresholds

Algorithm:
  1. Use audiogram from 19.1 (6 frequencies)
  2. Interpolate across full 20Hz-20kHz range via spline
  3. Model loudness perception via modified Zwicker loudness model
     - Critical bandwidth: Bark scale
     - Loudness growth: Steeper for frequencies with raised thresholds
  4. Generate individual 40-phon equal-loudness contour
     - Phon: Unit of loudness (1 phon = 1dB at 1kHz reference)

Application:
  - When user switches from headphones → speakers (different frequency response)
  - Auto-adjust EQ based on their personal hearing profile
  - Loudness-match A/B comparisons more accurately
```

#### 19.3: Aging & Hearing Loss Prediction
**File:** `lib/hearing/hearing-loss-model.ts`

```
Presbycusis (age-related hearing loss) model:
  - High-frequency loss typical (4-8kHz first)
  - Age-related trend: ~10dB per decade above 60 years

Optional: User inputs age + baseline audiogram from periodic tests
  → Model predicts future hearing trajectory
  → Show graph: "Your hearing at 50, 60, 70 years"
  → Suggest preventive measures (hearing protection in loud environments)

Use case:
  - Motivate hearing health
  - Warn when listening levels might accelerate hearing damage
```

### 📊 Metrics & Validation
- **Test-retest reliability:** Correlation > 0.95 (repeated tests)
- **Comparison to clinical audiometer:** ±3dB agreement (95% confidence)
- **Hearing loss detection:** Sensitivity 85%, Specificity 90% vs clinical diagnosis
- **User comfort:** 4/5 rating for test ease

### 🗓️ Timeline: 5-7 tuần

---

## Phase 20: Psychoacoustic Optimization via Subjective Quality Metrics

### 🎯 Mục tiêu
Tối ưu hóa EQ settings không chỉ dựa trên objective metrics mà còn dựa trên các cảm nhận chủ quan (brightness, warmth, spaciousness).

### 🔧 Thuật toán & Công nghệ

#### 20.1: Brightness & Warmth Perceptual Scales
**File:** `lib/perception/brightness-warmth.ts`

```typescript
// Correlate spectral features to perceptual adjectives

Brightness (0-100 scale):
  - Dominant frequency: Centroid of power spectrum
  - Formula: Brightness = 100 × Σ(freq × power(freq)) / Σ(power(freq)) / 10000
  - Typical range: 1000-5000 Hz correlates with bright percept
  
Warmth (0-100 scale):
  - Inverse relationship with brightness
  - Bass energy in 100-500Hz range
  - Formula: Warmth = 100 × log10(RMS_bass / RMS_treble + 1)
  
Sharpness (0-100):
  - Presence peak around 2-5kHz
  - Zwicker's sharpness algorithm (E_acum, Bark scale)
  - High values = piercing, tiring perception

Loudness (LUFS):
  - Already implemented (ITU-R BS.1770-4)
  - Perceptual ranking: Softness ↔ Loudness
```

#### 20.2: Multi-objective EQ Optimization
**File:** `lib/optimization/pareto-eq.ts`

```typescript
// Pareto front: optimize multiple competing objectives

Objectives:
  1. User preference match (maximize similarity to user's historical choices)
  2. Perceptual quality (maximize brightness + warmth balance)
  3. Spectral flatness (minimize spectral variance)
  4. Hearing profile match (maximize audibility in user's weak frequencies)
  5. Genre appropriateness (maximize match to typical genre profile)

Pareto optimization:
  - Generate 1000 candidate EQ curves via random sampling
  - Evaluate each on 5 objectives → 5D score vector
  - Eliminate dominated solutions (worse on all axes)
  - Remaining: Pareto frontier
  - User selects preferred point from frontier (3D visualization)

Result:
  - User sees trade-offs explicitly
  - "More bass vs more clarity?" → Drag slider on Pareto surface
  - Multiple good solutions instead of single "optimal"
```

#### 20.3: Crowdsourced Perceptual Calibration
**File:** `lib/perception/crowdsourcing.ts`

```
Build reference dataset:
  1. Generate 20 synthetic test signals (pink noise + tone + sweep combinations)
  2. Apply 10 different EQ curves to each
  3. Crowd-source rating task: Describe each variant (1-5 adjectives per sample)
     - "bright", "warm", "harsh", "dull", "punchy", "smooth", etc.

Analysis:
  - Collect 100+ ratings per variant
  - Map EQ curve → Adjective distribution
  - Train classifier: EQ curve → predicted adjectives + confidence

Validation:
  - Test on new EQ curves not in training set
  - User listens to prediction ("This EQ is 75% bright, 40% warm, 20% harsh")
  - Compare to their subjective perception
  - Refine model
```

### 📊 Metrics & Deliverables
- **Perceptual scale calibration:** User agreement > 80% with model predictions
- **Pareto frontier size:** 30-50 non-dominated solutions typical
- **Optimization time:** < 500ms to compute frontier from 1000 candidates
- **Crowdsourcing data:** 1000+ unique EQ-to-adjective mappings

### 🗓️ Timeline: 5-6 tuần

---

## 📊 Summary: Phase 11-20 Timeline & Priorities

| Phase | Focus | Priority | Duration (weeks) | Cumulative |
|-------|-------|----------|-----------------|-----------|
| 11 | Neural Net EQ Prediction | **HIGH** | 4-6 | 4-6 |
| 12 | Genre & Mood Classification | **HIGH** | 3-4 | 7-10 |
| 13 | Room Acoustics Modeling | **MEDIUM** | 5-6 | 12-16 |
| 14 | GPU Acceleration (WebGPU) | **HIGH** | 4-5 | 16-21 |
| 15 | Attention-based Preferences | **MEDIUM** | 4-5 | 20-26 |
| 16 | Voice/Speech Enhancement | **MEDIUM** | 5-6 | 25-32 |
| 17 | VST/AU Plugin Integration | **HIGH** | 8-10 | 33-42 |
| 18 | Cloud Sync & Social Sharing | **MEDIUM** | 6-8 | 39-50 |
| 19 | Hearing Profile Assessment | **MEDIUM** | 5-7 | 44-57 |
| 20 | Psychoacoustic Optimization | **LOW** | 5-6 | 49-63 |

**Total estimated timeline:** 6-12 months (aggressive), 12-18 months (realistic)

---

## 🎯 Quick-Start Recommendation

**Start Phase 11 + 12 first (HIGH priority):**
1. **Phase 11** (Neural Net): Immediate user impact (better EQ suggestions)
2. **Phase 12** (Genre classifier): Prerequisite for Phase 11 context
3. **Phase 14** (GPU): Performance improvement applies to all future phases
4. **Phase 17** (VST): Opens pro/prosumer market segment

Then proceed with Phase 13-20 based on market feedback & resource availability.

---

## 🔧 Development Stack Recommendations

### Frontend/Client
- **Framework:** React 18+ (continue current)
- **ML:** TensorFlow.js 4.x (lightweight models)
- **Audio:** Web Audio API + WebGPU (Phase 14+)
- **Testing:** Vitest + Playwright (existing)

### Backend (Phase 18+)
- **Runtime:** Node.js 18+ / Bun
- **Framework:** Express.js or Hono (lightweight)
- **Database:** PostgreSQL + Redis (caching)
- **Deployment:** Docker → Kubernetes (scalability)

### DSP/Plugin (Phase 17)
- **Framework:** JUCE 7.x (C++17)
- **WebView:** CEF (Chromium Embedded Framework)
- **Testing:** Catch2 + manual DAW testing

### DevOps
- **CI/CD:** GitHub Actions (existing)
- **Monitoring:** Sentry + DataDog APM
- **CDN:** Cloudflare (static assets + ML models)

---

## 📋 Success Criteria

**Phase 11-20 completion metrics:**
- ✅ 15+ new algorithms implemented
- ✅ 70%+ user satisfaction in A/B testing
- ✅ < 100ms total latency for real-time processing
- ✅ VST/AU plugin available on major DAWs
- ✅ 50,000+ monthly active users
- ✅ 4.5+ star rating on app stores
- ✅ < 5 critical bugs at any time (production)

---

**Document prepared:** 2026-05-01  
**Status:** Approved for Planning Phase  
**Next review:** 2026-06-01
