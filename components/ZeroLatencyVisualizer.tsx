'use client';

import React, { useEffect, useRef } from 'react';
import { useAudioEngine } from '@/lib/audio-engine-context';

interface ZeroLatencyVisualizerProps {
  pipelineInfo?: {
    actualSampleRate: number;
    targetSampleRate: number;
    isResampled: boolean;
  };
}

// Zero-crossing trigger for stable scope display
function findTrigger(buf: Float32Array): number {
  const half = Math.floor(buf.length * 0.5);
  for (let i = 1; i < half; i++) {
    if (buf[i - 1] <= 0 && buf[i] > 0) return i;
  }
  return 0;
}

export const ZeroLatencyVisualizer: React.FC<ZeroLatencyVisualizerProps> = ({ pipelineInfo }) => {
  const engine = useAudioEngine();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const portRef      = useRef<MessagePort | null>(null);
  // ring buffer: always hold the latest audio frame from the worklet
  const audioRef     = useRef<Float32Array>(new Float32Array(0));
  const connectedRef = useRef(false);

  // canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0)  canvas.width  = Math.round(r.width);
      if (r.height > 0) canvas.height = Math.round(r.height);
    });
    ro.observe(canvas);
    const r = canvas.getBoundingClientRect();
    if (r.width > 0)  canvas.width  = Math.round(r.width);
    if (r.height > 0) canvas.height = Math.round(r.height);
    return () => ro.disconnect();
  }, []);

  // engine connection + draw loop
  useEffect(() => {
    let connectRaf: number;
    let attempts = 0;

    // ── connect to tap-processor via MessageChannel ──────────────────
    // We deliberately avoid transferControlToOffscreen() because:
    //   1. calling it twice (re-mount, engine reinit) throws InvalidStateError
    //   2. the worker can't resize the canvas on demand
    // Instead we receive raw Float32Array frames on a MessagePort and
    // draw them ourselves — simpler and always correct after remounts.
    const tryConnect = () => {
      if (engine?.tapNode && !connectedRef.current) {
        // close any stale port from a previous mount
        portRef.current?.close();

        const ch = new MessageChannel();
        portRef.current = ch.port2;
        ch.port2.onmessage = (e) => {
          if (e.data?.type === 'audio_data') {
            audioRef.current = e.data.data as Float32Array;
          }
        };
        ch.port2.start();

        // tell the AudioWorklet to forward audio frames here
        engine.tapNode.port.postMessage(
          { type: 'setup_port', port: ch.port1 },
          [ch.port1]
        );
        connectedRef.current = true;
        return;
      }
      if (++attempts < 180) {   // retry up to ~3 s
        connectRaf = requestAnimationFrame(tryConnect);
      }
    };
    connectRaf = requestAnimationFrame(tryConnect);

    // ── draw loop ─────────────────────────────────────────────────────
    let lastDrawTime = performance.now();
    const minFrameTime = 1000 / 30; // 30 FPS throttle

    const draw = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(draw);
      
      if (timestamp - lastDrawTime < minFrameTime) return;
      lastDrawTime = timestamp;

      performance.mark('zlv-start');

      const canvas = canvasRef.current;
      if (!canvas) {
        performance.clearMarks('zlv-start');
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        performance.clearMarks('zlv-start');
        return;
      }

      const W = canvas.width, H = canvas.height;
      const buf = audioRef.current;

      ctx.fillStyle = 'rgb(8,8,15)';
      ctx.fillRect(0, 0, W, H);

      const cy = H / 2;
      // center guide
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
      ctx.setLineDash([]);

      if (buf.length < 2) {
        performance.mark('zlv-end');
        try { performance.measure('ZeroLatencyFrame', 'zlv-start', 'zlv-end'); } catch (e) {}
        return;
      }

      const start    = findTrigger(buf);
      const displayN = Math.min(buf.length - start, Math.floor(buf.length * 0.75));
      if (displayN < 2) {
        performance.mark('zlv-end');
        try { performance.measure('ZeroLatencyFrame', 'zlv-start', 'zlv-end'); } catch (e) {}
        return;
      }

      const buildPath = () => {
        const p = new Path2D();
        for (let i = 0; i < displayN; i++) {
          const x = (i / displayN) * W;
          const y = cy - buf[start + i] * cy * 0.9;
          if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        return p;
      };

      // glow
      ctx.save();
      ctx.filter = 'blur(4px)';
      ctx.strokeStyle = 'rgba(242,125,38,.2)';
      ctx.lineWidth = 8;
      ctx.stroke(buildPath());
      ctx.restore();

      // main line
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0,   'rgba(255,100,30,.3)');
      grad.addColorStop(0.4, 'rgba(242,125,38,.95)');
      grad.addColorStop(1,   'rgba(255,180,60,.5)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.stroke(buildPath());

      performance.mark('zlv-end');
      try { performance.measure('ZeroLatencyFrame', 'zlv-start', 'zlv-end'); } catch (e) {}
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(connectRaf);
      cancelAnimationFrame(rafRef.current);
      portRef.current?.close();
      portRef.current = null;
      connectedRef.current = false;
    };
  }, [engine]);

  return (
    <div className="w-full bg-[#08080f] rounded-xl border border-white/[.08] overflow-hidden flex flex-col h-[225px]">
      <div className="flex justify-between items-center px-4 py-2 border-b border-white/5 text-[10px] font-mono text-gray-400">
        <div className="flex gap-4">
          <span className="font-bold text-[#F27D26] uppercase tracking-wider">Zero-Latency Scope</span>
          <span className="text-gray-600">Worklet → Port → Canvas</span>
        </div>
        {pipelineInfo && (
          <div className={`px-2 py-0.5 rounded text-[9px] ${
            pipelineInfo.isResampled
              ? 'bg-orange-900/30 text-orange-400'
              : 'bg-green-900/30 text-green-400'
          }`}>
            {pipelineInfo.isResampled
              ? `Resampled ${pipelineInfo.actualSampleRate}Hz`
              : `Bit-Perfect ${pipelineInfo.actualSampleRate}Hz`}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} width={800} height={180} className="w-full flex-1 block" />
    </div>
  );
};
