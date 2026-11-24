import { useEffect, useRef, useState, type ReactNode } from "react";
import { clock, decode, toWav, useRecorder } from "./audio";
import { store, friendly } from "./store";
import type { Mood } from "./types";

/* ---------------- Icons (drawn here, one stroke weight) ---------------- */
const paths: Record<string, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />,
  gavel: (
    <>
      <path d="m13.5 4.5 6 6M11 7l6 6M9.5 8.5l6 6M12.2 5.8l-4 4M18.2 11.8l-4 4" />
      <path d="m10.5 12.5-6.5 6.5M3 21h9" />
    </>
  ),
  play: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16" />
    </>
  ),
  board: (
    <>
      <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5" />
      <path d="M4 8V5h3M17 5h3v3" />
    </>
  ),
  us: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  playtri: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10.5" r="1.6" />
      <path d="m21 16-5-5-8 8" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  crown: <path d="M4 18h16M5 15 4 7l4.5 3.5L12 5l3.5 5.5L20 7l-1 8z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  seal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5 13.3 10.6 16.5 10.9 14 13l.8 3.2L12 14.6 9.2 16.2 10 13 7.5 10.9l3.2-.3z" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function Icon({ name, size = 22, label }: { name: keyof typeof paths | string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      {paths[name]}
    </svg>
  );
}

/* ---------------- Weather for the check-in ---------------- */
export function MoodIcon({ mood, size = 40 }: { mood: Mood | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`mood ${mood ?? "none"}`} aria-hidden="true">
      {mood === "sun" && (
        <g>
          <circle cx="24" cy="24" r="9" fill="var(--gold)" />
          {[...Array(8)].map((_, i) => (
            <line key={i} x1="24" y1="6" x2="24" y2="10.5" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${i * 45} 24 24)`} />
          ))}
        </g>
      )}
      {mood === "cloud" && (
        <g>
          <circle cx="30" cy="17" r="7" fill="var(--gold)" opacity=".85" />
          <path d="M14 34h20a7 7 0 0 0 0-14 9 9 0 0 0-17 2.5A5.8 5.8 0 0 0 14 34z" fill="var(--cloud)" />
        </g>
      )}
      {mood === "rain" && (
        <g>
          <path d="M13 28h22a7 7 0 0 0 0-14 9 9 0 0 0-17 2.5A5.8 5.8 0 0 0 13 28z" fill="var(--rain)" />
          {[17, 24, 31].map((x) => (
            <line key={x} x1={x} y1="33" x2={x - 2} y2="39" stroke="var(--rain)" strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </g>
      )}
      {!mood && <circle cx="24" cy="24" r="10" fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 4" />}
    </svg>
  );
}
export const MOOD_WORD: Record<Mood, string> = { sun: "Good day", cloud: "Okay day", rain: "Rough day" };

/* ---------------- Sheets (slide up from the bottom) ---------------- */
export function Sheet({ title, onClose, children, tone }: { title: string; onClose: () => void; children: ReactNode; tone?: "royal" | "quiet" }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    document.body.classList.add("locked");
    return () => {
      removeEventListener("keydown", key);
      document.body.classList.remove("locked");
    };
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${tone ?? ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Runs an action, shows "…" while it works and the error if it fails. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(friendly(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

/* ---------------- Stored photos ---------------- */
export function StoredImage({ path, alt = "", className }: { path: string | null; alt?: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (path) store.url(path).then((u) => live && setSrc(u)).catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return null;
  return src ? <img className={className} src={src} alt={alt} loading="lazy" /> : <span className={`${className ?? ""} img-wait`} />;
}

/** Makes big phone photos small enough to upload quickly. */
export async function shrinkPhoto(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

/* ---------------- Voice notes ---------------- */
export function Waveform({ peaks, progress = 0 }: { peaks: number[] | null; progress?: number }) {
  const bars = peaks?.length ? peaks : Array.from({ length: 40 }, (_, i) => 0.3 + 0.25 * Math.sin(i * 0.9) ** 2);
  return (
    <span className="wave" aria-hidden="true">
      {bars.map((p, i) => (
        <i key={i} style={{ height: `${Math.max(12, p * 100)}%` }} className={i / bars.length < progress ? "on" : ""} />
      ))}
    </span>
  );
}

let playing: HTMLAudioElement | null = null;

export function Voice({ path, peaks, label }: { path: string; peaks: number[] | null; label?: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = async () => {
    try {
      if (!audio.current) {
        const a = new Audio(await store.url(path));
        a.ontimeupdate = () => a.duration && setProgress(a.currentTime / a.duration);
        a.onloadedmetadata = () => setDuration(a.duration);
        a.onended = () => (setOn(false), setProgress(0));
        a.onpause = () => setOn(false);
        a.onplay = () => setOn(true);
        audio.current = a;
      }
      const a = audio.current;
      if (a.paused) {
        // Only one voice note at a time
        if (playing && playing !== a) playing.pause();
        playing = a;
        await a.play();
      } else a.pause();
    } catch {
      setErr(true);
    }
  };
  return (
    <div className="voice">
      <button className="voice-btn" onClick={toggle} aria-label={on ? "Pause" : `Play ${label ?? "voice note"}`}>
        <Icon name={on ? "pause" : "playtri"} size={18} />
      </button>
      <Waveform peaks={peaks} progress={progress} />
      <small>{err ? "Can't play" : duration ? clock(duration) : ""}</small>
    </div>
  );
}

export type VoiceResult = { path: string; peaks: number[]; duration: number };

/** Record, or upload a voice note / screen recording, trim it, keep it. */
export function VoiceMaker({ onDone, hint }: { onDone: (v: VoiceResult | null) => void; hint?: string }) {
  const rec = useRecorder();
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<VoiceResult | null>(null);
  const preview = useRef<AudioBufferSourceNode | null>(null);

  const take = async (blob: Blob) => {
    setBusy(true);
    setErr(null);
    try {
      const b = await decode(blob);
      setBuffer(b);
      setRange([0, b.duration]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const listen = () => {
    if (!buffer) return;
    preview.current?.stop();
    const c = new AudioContext();
    const s = c.createBufferSource();
    s.buffer = buffer;
    s.connect(c.destination);
    s.start(0, range[0], range[1] - range[0]);
    preview.current = s;
  };
  const keep = async () => {
    if (!buffer) return;
    setBusy(true);
    setErr(null);
    try {
      preview.current?.stop();
      const wav = await toWav(buffer, range[0], range[1]);
      const path = await store.upload(wav.blob, "wav");
      const v = { path, peaks: wav.peaks, duration: wav.duration };
      setSaved(v);
      onDone(v);
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  if (saved)
    return (
      <div className="vm">
        <Voice path={saved.path} peaks={saved.peaks} />
        <button
          className="link"
          onClick={() => {
            setSaved(null);
            setBuffer(null);
            onDone(null);
          }}
        >
          Remove
        </button>
      </div>
    );

  if (buffer) {
    const d = buffer.duration;
    return (
      <div className="vm">
        <p className="small muted">Trim the start and end, so it's just the bit you want.</p>
        <label className="trim">
          <span>Starts at {clock(range[0])}</span>
          <input type="range" min={0} max={d} step={0.1} value={range[0]} onChange={(e) => setRange(([, b]) => [Math.min(Number(e.target.value), b - 0.5), b])} />
        </label>
        <label className="trim">
          <span>Ends at {clock(range[1])}</span>
          <input type="range" min={0} max={d} step={0.1} value={range[1]} onChange={(e) => setRange(([a]) => [a, Math.max(Number(e.target.value), a + 0.5)])} />
        </label>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="btn" onClick={listen}>
            Listen
          </button>
          <button className="btn" onClick={() => setBuffer(null)}>
            Start again
          </button>
          <button className="btn primary" onClick={keep} disabled={busy}>
            {busy ? "Saving…" : `Keep ${clock(range[1] - range[0])}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vm">
      {rec.recording ? (
        <button className="btn rec on" onClick={async () => take(await rec.stop())}>
          <span className="rec-dot" /> Stop · {clock(rec.seconds)}
        </button>
      ) : (
        <div className="row">
          <button className="btn rec" onClick={rec.start} disabled={busy}>
            <Icon name="mic" size={18} /> Record
          </button>
          <label className="btn">
            Upload
            <input type="file" accept="audio/*,video/*" hidden onChange={(e) => e.target.files?.[0] && take(e.target.files[0])} />
          </label>
        </div>
      )}
      {hint && !rec.recording && <p className="small muted">{hint}</p>}
      {busy && <p className="small muted">Reading the sound…</p>}
      {(rec.error || err) && <p className="err">{rec.error ?? err}</p>}
    </div>
  );
}

/* ---------------- Little helpers ---------------- */
export const when = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24 && d.getDate() === now.getDate()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
export const prettyDate = (key: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
