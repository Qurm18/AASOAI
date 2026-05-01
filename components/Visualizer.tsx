'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface VisualizerProps {
  analyzer: AnalyserNode | null;
  analyzerL?: AnalyserNode | null;
  analyzerR?: AnalyserNode | null;
  metrics?: { momentary: number; shortTerm: number; peak: number; psr: number };
}

type ViewMode = 'spectrum' | 'oscilloscope' | 'waterfall';
type Palette = 'fire' | 'ice' | 'plasma';

// ── helpers ──────────────────────────────────────────────────────────────────

function linToDb(lin: number): number {
  if (lin <= 0) return -96;
  return Math.max(-96, 20 * Math.log10(lin));
}

function freqToX(freq: number, W: number): number {
  const MIN = 20, MAX = 22050;
  return (Math.log10(freq / MIN) / Math.log10(MAX / MIN)) * W;
}

function pearsonCorr(L: Float32Array, R: Float32Array): number {
  const N = Math.min(L.length, R.length);
  let sl = 0, sr = 0, sl2 = 0, sr2 = 0, slr = 0;
  for (let i = 0; i < N; i++) {
    sl += L[i]; sr += R[i]; sl2 += L[i] * L[i];
    sr2 += R[i] * R[i]; slr += L[i] * R[i];
  }
  const num = N * slr - sl * sr;
  const den = Math.sqrt((N * sl2 - sl * sl) * (N * sr2 - sr * sr));
  return den === 0 ? 1 : Math.max(-1, Math.min(1, num / den));
}

function waterfallColor(v: number, palette: Palette): string {
  const t = Math.max(0, Math.min(1, v));
  if (palette === 'fire') {
    const r = Math.round(255 * Math.min(1, t * 2));
    const g = Math.round(255 * Math.max(0, t * 2 - 1));
    return `rgb(${r},${g},0)`;
  }
  if (palette === 'ice') {
    const b = Math.round(255 * Math.min(1, t * 2));
    const w = Math.round(255 * Math.max(0, t * 2 - 1));
    return `rgb(${w},${w},${b})`;
  }
  // plasma
  const r = Math.round(255 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2)));
  const g = Math.round(255 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 2)));
  const b = Math.round(255 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2)));
  return `rgb(${r},${g},${b})`;
}

// ── component ─────────────────────────────────────────────────────────────────

export const Visualizer: React.FC<VisualizerProps> = ({ analyzer, analyzerL, analyzerR, metrics }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  // persistent buffers — allocated once when analyzer arrives
  const freqBuf  = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeBuf  = useRef<Float32Array<ArrayBuffer> | null>(null);
  const lBuf     = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rBuf     = useRef<Float32Array<ArrayBuffer> | null>(null);
  // waterfall rows
  const wfRows   = useRef<Uint8Array<ArrayBuffer>[]>([]);
  const wfHead   = useRef(0);
  const WF_MAX   = 80;

  const [mode, setMode]           = useState<ViewMode>('spectrum');
  const [palette, setPalette]     = useState<Palette>('fire');
  const [showPeaks, setShowPeaks] = useState(true);
  const [isSymmetric, setIsSymmetric] = useState(true);
  const [corr, setCorr]           = useState(1);
  const [dbVal, setDbVal]         = useState(-96);
  const [centroid, setCentroid]   = useState(0);

  // peak hold per-bin
  const peakBuf     = useRef<Float32Array<ArrayBuffer> | null>(null);
  const peakHold    = useRef<Float32Array<ArrayBuffer> | null>(null);

  // smoothing buffer for visual stability
  const smoothBuf   = useRef<Float32Array<ArrayBuffer> | null>(null);

  // canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0)  canvas.width  = Math.round(r.width * (window.devicePixelRatio || 1));
      if (r.height > 0) canvas.height = Math.round(r.height * (window.devicePixelRatio || 1));
    });
    ro.observe(canvas);
    // initial
    const r = canvas.getBoundingClientRect();
    if (r.width > 0)  canvas.width  = Math.round(r.width * (window.devicePixelRatio || 1));
    if (r.height > 0) canvas.height = Math.round(r.height * (window.devicePixelRatio || 1));
    return () => ro.disconnect();
  }, []);

  // draw loop
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!analyzer) return;

    const bins = analyzer.frequencyBinCount;
    freqBuf.current  = new Uint8Array(bins);
    timeBuf.current  = new Float32Array(analyzer.fftSize);
    lBuf.current     = new Float32Array(analyzerL?.fftSize ?? 1024);
    rBuf.current     = new Float32Array(analyzerR?.fftSize ?? 1024);
    peakBuf.current  = new Float32Array(bins);
    peakHold.current = new Float32Array(bins); 
    smoothBuf.current = new Float32Array(bins);

    // init waterfall
    wfRows.current = Array.from({ length: WF_MAX }, () => new Uint8Array(bins));
    wfHead.current = 0;

    const SR = (analyzer.context as AudioContext).sampleRate;
    const DB_FLOOR = -90, DB_CEIL = 0;
    let frame = 0;

    const drawSpectrum = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const data     = freqBuf.current!;
      const smoothed = smoothBuf.current!;
      const peaks    = peakBuf.current!;
      const hold     = peakHold.current!;
      const drawH    = H - 24;

      // Deep dark background with a slight gradient
      const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W/2);
      bgGrad.addColorStop(0, '#0f0f1a');
      bgGrad.addColorStop(1, '#050508');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Smooth the data
      for (let i = 0; i < bins; i++) {
        smoothed[i] += (data[i] - smoothed[i]) * 0.45;
      }

      // Grid Rendering
      ctx.save();
      // dB lines
      ctx.font = `${Math.round(10 * (window.devicePixelRatio || 1))}px JetBrains Mono, monospace`;
      for (const db of [-72, -60, -48, -36, -24, -12, 0]) {
        const y = drawH - ((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * drawH;
        ctx.strokeStyle = db === 0 ? 'rgba(242,125,38,0.25)' : 'rgba(255,255,255,0.03)';
        ctx.lineWidth = db === 0 ? 2 : 0.8;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillText(`${db}dB`, 10, y - 5);
      }

      // Logarithmic freq lines
      const freqMarkers = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      for (const f of freqMarkers) {
        const x = freqToX(f, W);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, drawH); ctx.stroke();
        
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillText(f >= 1000 ? `${f/1000}k` : `${f}`, x + 5, H - 8);
      }
      ctx.restore();

      const renderOneSide = (inverseX = false) => {
        const path = new Path2D();
        const edge = new Path2D();
        let first = true;

        for (let i = 1; i < bins; i++) {
          const freq = (i / bins) * (SR / 2);
          if (freq < 20 || freq > 22050) continue;
          
          let x = freqToX(freq, isSymmetric ? W / 2 : W);
          if (inverseX) x = W - x;
          else if (isSymmetric) x = x;

          const db = linToDb(smoothed[i] / 255);
          const y = drawH - ((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * drawH;

          if (first) {
            path.moveTo(x, drawH);
            path.lineTo(x, y);
            edge.moveTo(x, y);
            first = false;
          } else {
            path.lineTo(x, y);
            edge.lineTo(x, y);
          }

          // Peak handling
          const val = data[i] / 255;
          if (val >= peaks[i]) { peaks[i] = val; hold[i] = 40; }
          else if (hold[i] > 0) { hold[i]--; }
          else peaks[i] = Math.max(0, peaks[i] - 0.002);
        }

        const anchorX = inverseX ? W : (isSymmetric ? W / 2 : W);
        path.lineTo(anchorX, drawH);
        path.closePath();

        // Main Color
        const brandGrad = ctx.createLinearGradient(0, 0, 0, drawH);
        brandGrad.addColorStop(0,   'rgba(242,125,38,0.5)');
        brandGrad.addColorStop(0.5, 'rgba(242,125,38,0.2)');
        brandGrad.addColorStop(1,   'rgba(242,125,38,0)');
        
        ctx.fillStyle = brandGrad;
        ctx.fill(path);

        // Edge Glow
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(242,125,38,0.8)';
        ctx.strokeStyle = '#f27d26';
        ctx.lineWidth = 2.5;
        ctx.stroke(edge);
        ctx.restore();
      };

      if (isSymmetric) {
        renderOneSide(false);
        renderOneSide(true);
      } else {
        renderOneSide(false);
      }

      // Peaks visualization
      if (showPeaks) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 1; i < bins; i++) {
          if (peaks[i] < 0.01) continue;
          const freq = (i / bins) * (SR / 2);
          if (freq < 20 || freq > 22050) continue;
          
          const db = linToDb(peaks[i]);
          const y = drawH - ((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * drawH;
          
          if (isSymmetric) {
            const x1 = freqToX(freq, W / 2);
            const x2 = W - x1;
            ctx.fillRect(x1 - 1, y, 2, 2);
            ctx.fillRect(x2 - 1, y, 2, 2);
          } else {
            const x = freqToX(freq, W);
            ctx.fillRect(x - 1, y, 2, 2);
          }
        }
      }
    };

    const drawOscilloscope = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const buf = timeBuf.current!;
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);
      const cy = H / 2;

      // Scanned grid
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 1;
      for(let x=0; x<W; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for(let y=0; y<H; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      ctx.strokeStyle = 'rgba(242,125,38,0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

      const N = buf.length;
      let start = 0;
      // Triggering
      for (let i = 1; i < Math.floor(N * 0.5); i++) {
        if (buf[i - 1] <= 0 && buf[i] > 0) { start = i; break; }
      }
      const displayN = Math.min(N - start, Math.floor(N * 0.6));
      if (displayN < 2) return;

      const p = new Path2D();
      for (let i = 0; i < displayN; i++) {
        const x = (i / displayN) * W;
        const y = cy - buf[start + i] * cy * 0.85;
        if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
      }

      // Multi-pass glow
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(242,125,38,0.9)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke(p);
      
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#f27d26';
      ctx.lineWidth = 4;
      ctx.globalCompositeOperation = 'screen';
      ctx.stroke(p);
      ctx.restore();
    };

    const drawWaterfall = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const data = freqBuf.current!;
      // push new row
      wfRows.current[wfHead.current].set(data);
      wfHead.current = (wfHead.current + 1) % WF_MAX;

      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);
      const rowH = Math.max(1, (H - 12) / WF_MAX);

      for (let age = 0; age < WF_MAX; age++) {
        const idx = (wfHead.current - 1 - age + WF_MAX) % WF_MAX;
        const row = wfRows.current[idx];
        const y = age * rowH;
        for (let i = 1; i < bins; i++) {
          const freq = (i / bins) * (SR / 2);
          if (freq < 20 || freq > 22050) continue;
          
          let x = freqToX(freq, W);
          ctx.fillStyle = waterfallColor(row[i] / 255, palette);
          // Scale rect size for high DPI
          const rectW = Math.max(1, (W / bins) * 1.5);
          ctx.fillRect(x, y, rectW, rowH + 1);
        }
      }
    };

    let lastDrawTime = performance.now();
    const minFrameTime = 1000 / 30; // 30 FPS throttle

    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);
      
      if (timestamp - lastDrawTime < minFrameTime) return;
      lastDrawTime = timestamp;

      performance.mark('vis-start');

      const canvas = canvasRef.current;
      if (!canvas) {
        performance.clearMarks('vis-start');
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        performance.clearMarks('vis-start');
        return;
      }

      // resume suspended context (don't bail out — still draw)
      if (analyzer.context.state === 'suspended') {
        (analyzer.context as AudioContext).resume().catch(() => {});
      }

      analyzer.getByteFrequencyData(freqBuf.current as Uint8Array<ArrayBuffer>);
      analyzer.getFloatTimeDomainData(timeBuf.current as Float32Array<ArrayBuffer>);

      const W = canvas.width, H = canvas.height;

      if (mode === 'spectrum')     drawSpectrum(ctx, W, H);
      else if (mode === 'oscilloscope') drawOscilloscope(ctx, W, H);
      else if (mode === 'waterfall' && frame % 2 === 0) drawWaterfall(ctx, W, H);

      // stats — throttled
      if (frame % 6 === 0) {
        const data = freqBuf.current!;
        // rms
        let rms = 0;
        for (let i = 0; i < data.length; i++) rms += (data[i]/255) ** 2;
        rms = Math.sqrt(rms / data.length);
        setDbVal(Math.round(linToDb(rms)));

        // centroid
        let num = 0, den = 0;
        for (let i = 0; i < data.length; i++) {
          const f = (i / data.length) * (SR / 2);
          const m = data[i] / 255;
          num += f * m; den += m;
        }
        setCentroid(Math.round(den > 0 ? num / den : 0));

        // correlation
        if (analyzerL && analyzerR) {
          analyzerL.getFloatTimeDomainData(lBuf.current!);
          analyzerR.getFloatTimeDomainData(rBuf.current!);
          setCorr(Math.round(pearsonCorr(lBuf.current!, rBuf.current!) * 100) / 100);
        }
      }
      frame++;
      
      performance.mark('vis-end');
      try {
        performance.measure('VisualizerFrame', 'vis-start', 'vis-end');
      } catch (e) {}
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyzer, analyzerL, analyzerR, mode, palette, showPeaks, isSymmetric]);

  const lufs = metrics ? Math.round(metrics.shortTerm) : -70;
  const corrColor = corr > 0.5 ? '#4ade80' : corr > 0 ? '#fbbf24' : '#f87171';

  return (
    <div className="w-full bg-[#08080f] rounded-xl border border-white/[.08] overflow-hidden">
      {/* controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <div className="flex gap-1 items-center">
          {(['spectrum','oscilloscope','waterfall'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-2 py-0.5 rounded text-[9px] uppercase font-mono tracking-wider transition-all ${
                mode === m ? 'bg-[#F27D26] text-black font-bold' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {m === 'oscilloscope' ? 'scope' : m}
            </button>
          ))}
          {mode === 'waterfall' && (
            <select value={palette} onChange={e => setPalette(e.target.value as Palette)}
              className="ml-1 px-1 py-0.5 rounded text-[9px] bg-white/5 text-gray-400 border-0 cursor-pointer">
              <option value="fire">Fire</option>
              <option value="ice">Ice</option>
              <option value="plasma">Plasma</option>
            </select>
          )}
          {mode === 'spectrum' && (
            <>
              <button onClick={() => setShowPeaks(p => !p)}
                className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-mono ${showPeaks ? 'text-amber-400' : 'text-gray-600'}`}>
                PEAKS
              </button>
              <button onClick={() => setIsSymmetric(p => !p)}
                className={`ml-1 px-1.5 py-0.5 rounded text-[8px] font-mono ${isSymmetric ? 'text-blue-400' : 'text-gray-600'}`}>
                MIRROR
              </button>
            </>
          )}
        </div>

        <div className="text-[8px] font-mono flex gap-3 items-center text-gray-500">
          <span>LUFS <span className="text-[#F27D26]">{lufs}</span></span>
          <span>dBFS <span className="text-amber-400">{dbVal}</span></span>
          <span>SC <span className="text-gray-300">{centroid >= 1000 ? `${(centroid/1000).toFixed(1)}k` : centroid}Hz</span></span>
          <span style={{ color: corrColor }}>ρ {corr.toFixed(2)}</span>
        </div>
      </div>

      <canvas ref={canvasRef} width={800} height={180} className="w-full h-[180px] block" />
    </div>
  );
};

Visualizer.displayName = 'Visualizer';
