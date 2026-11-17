// Voice notes. Anything you give it (an in-app recording, an audio file, or a screen recording of a
// chat) is turned into a small, trimmed WAV that plays on both iPhone and Android.

import { useEffect, useRef, useState } from "react";

const RATE = 22050; // clear for voices, and small: about 2.6 MB a minute

let ctx: AudioContext | null = null;
const audioCtx = () => (ctx ??= new AudioContext());

/** Reads the sound out of an audio or video file. */
export async function decode(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  try {
    return await audioCtx().decodeAudioData(data);
  } catch {
    throw new Error("Couldn't read the sound in that file. Try a screen recording or a voice memo.");
  }
}

/** Loudness in `n` slices, 0 to 1, for drawing the waveform. */
export function peaksOf(buffer: AudioBuffer, n = 56, start = 0, end = buffer.duration) {
  const ch = buffer.getChannelData(0);
  const a = Math.floor(start * buffer.sampleRate);
  const b = Math.floor(end * buffer.sampleRate);
  const step = Math.max(1, Math.floor((b - a) / n));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let j = a + i * step; j < Math.min(b, a + (i + 1) * step); j += 16) max = Math.max(max, Math.abs(ch[j]));
    out.push(max);
  }
  const top = Math.max(...out, 0.01);
  return out.map((v) => Math.round((v / top) * 100) / 100);
}

/** The part between start and end, as a mono WAV. */
export async function toWav(buffer: AudioBuffer, start = 0, end = buffer.duration) {
  const length = Math.max(1, Math.ceil((end - start) * RATE));
  const off = new OfflineAudioContext(1, length, RATE);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start(0, start, end - start);
  const out = await off.startRendering();
  const pcm = out.getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return { blob: new Blob([view], { type: "audio/wav" }), peaks: peaksOf(out), duration: end - start };
}

/** Records from the microphone. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const done = useRef<((b: Blob) => void) | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        done.current?.(new Blob(chunks, { type: mr.mimeType }));
      };
      mr.start();
      rec.current = { mr, chunks, stream };
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      setError((e as Error).name === "NotAllowedError" ? "Microphone access was refused. Allow it in Settings for this site." : "Couldn't start the microphone.");
    }
  };
  const stop = () =>
    new Promise<Blob>((ok) => {
      done.current = ok;
      setRecording(false);
      rec.current?.mr.stop();
    });
  return { recording, seconds, error, start, stop };
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
