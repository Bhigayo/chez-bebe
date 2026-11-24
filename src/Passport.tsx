import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { COUNTRIES, COUNTRY, flag, type Country } from "./countries";
import { useChez } from "./data";
import { dayKey, deckFor } from "./logic";
import { friendly, store } from "./store";
import { Icon, prettyDate, Sheet, useAction } from "./ui";
import type { Choice, PassportMatch } from "./types";

// The Passport: swipe on every country. Only the ones you both say yes to get stamped,
// and once you've both sealed your passports, one stamp is drawn as the first trip.

const TOTAL = COUNTRIES.length;
const read = (key: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const write = (key: string, v: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // fine
  }
};
const tilt = (code: string) => ((code.charCodeAt(0) * 7 + code.charCodeAt(1) * 13) % 13) - 6;

export function BoardTabs({ on }: { on: "castles" | "passport" }) {
  return (
    <nav className="seg">
      <a href="#/board" className={on === "castles" ? "on" : ""}>
        Castles
      </a>
      <a href="#/board/passport" className={on === "passport" ? "on" : ""}>
        Passport
      </a>
    </nav>
  );
}

export default function Passport() {
  const { me, partner, t, them, reload } = useChez();
  const [pending, setPending] = useState<Map<string, Choice>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState<PassportMatch | null>(null);
  const [sealing, setSealing] = useState(false);

  const mine = useMemo(() => new Set(t.passport_swipes.map((s) => s.country)), [t.passport_swipes]);
  const deck = useMemo(() => deckFor(me.user_id, COUNTRIES), [me.user_id]);
  const left = deck.filter((c) => !mine.has(c.code) && !pending.has(c.code));
  const myProgress = t.passport_progress.find((p) => p.who === me.who);
  const theirs = t.passport_progress.find((p) => p.who !== me.who);
  const sealed = !!myProgress?.sealed || t.passport_ready.some((r) => r.user_id === me.user_id);
  const superUsed = t.passport_swipes.some((s) => s.choice === "super") || [...pending.values()].includes("super");
  const last = [...t.passport_swipes].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  const matches = t.passport_matches;
  const stamped = new Set(matches.map((m) => m.country));
  const trip = t.passport_trip[0] ?? null;

  // "It's a match": stamps you haven't seen yet, on this phone
  const seenKey = `chez:passport-seen:${me.user_id}`;
  const [seen, setSeen] = useState(() => new Set(read(seenKey)));
  const fresh = matches.filter((m) => !seen.has(m.country));
  const markSeen = () => {
    const all = new Set([...seen, ...matches.map((m) => m.country)]);
    write(seenKey, [...all]);
    setSeen(all);
  };

  // When your swipe is the one that makes a match, let them know (not more than once every 10 minutes)
  const justSwiped = useRef(new Set<string>());
  const before = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(matches.map((m) => m.country));
    const made = before.current ? matches.filter((m) => !before.current!.has(m.country) && justSwiped.current.has(m.country)) : [];
    before.current = now;
    if (!made.length) return;
    const key = `chez:passport-pinged:${me.user_id}`;
    const lastPing = Number(read(key)[0] ?? 0);
    if (Date.now() - lastPing < 10 * 60_000) return;
    write(key, [String(Date.now())]);
    const name = COUNTRY.get(made[0].country)?.name ?? made[0].country;
    void store.notify("It's a match ✈️", `You both want to go to ${name}.`);
  }, [matches, me.user_id]);

  async function swipe(c: Country, choice: Choice) {
    setError(null);
    setPending((p) => new Map(p).set(c.code, choice));
    justSwiped.current.add(c.code);
    try {
      await store.swipe(c.code, choice);
      await reload();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setPending((p) => {
        const n = new Map(p);
        n.delete(c.code);
        return n;
      });
    }
  }

  async function undo() {
    if (!last) return;
    setError(null);
    try {
      await store.unswipe(last.country);
      justSwiped.current.delete(last.country);
      await reload();
    } catch (e) {
      setError(friendly(e));
    }
  }

  return (
    <div className="page passport">
      <header className="page-head">
        <p className="kicker">The Board</p>
        <h1>Passport</h1>
        <BoardTabs on="passport" />
      </header>

      <div className="pp-progress">
        <span>
          <b>You</b> {myProgress?.swiped ?? t.passport_swipes.length} / {TOTAL}
          {sealed && " ✓"}
        </span>
        <span>
          <b>{partner?.name ?? them}</b> {theirs?.swiped ?? 0} / {TOTAL}
          {theirs?.sealed && " ✓"}
          {theirs?.super_used && !trip && <span title={`${them} has used their Super Like`}> ★👀</span>}
        </span>
      </div>

      {trip ? (
        <FirstTrip code={trip.country} drawnAt={trip.drawn_at} />
      ) : sealed && theirs?.sealed ? (
        <section className="card pp-done">
          <h2>Nothing to draw</h2>
          <p className="muted">You both sealed your passports without a single match. Bold. Very bold.</p>
        </section>
      ) : sealed ? (
        <section className="card pp-done">
          <div className="pp-seal-mark">✈</div>
          <h2>Your passport is sealed</h2>
          <p className="muted">
            Waiting for {them} ({theirs?.swiped ?? 0} of {TOTAL} swiped). When they seal theirs, one of your stamps is drawn as <b>the first trip</b>.
          </p>
        </section>
      ) : left.length ? (
        <Deck cards={left.slice(0, 3)} onSwipe={swipe} superUsed={superUsed} canUndo={!!last && !stamped.has(last.country)} onUndo={undo} />
      ) : (
        <section className="card pp-done">
          <div className="pp-seal-mark">🌍</div>
          <h2>You've seen the whole world</h2>
          <p className="muted">Seal your passport when you're happy. After that there's no taking swipes back.</p>
          <p className="muted">Once you've both sealed yours, one of your stamps is drawn at random: that's the first trip. No rerolls.</p>
          <button className="btn primary wide" onClick={() => setSealing(true)}>
            Seal my passport
          </button>
        </section>
      )}
      {error && <p className="err">{error}</p>}

      <section className="card pp-stamps">
        <div className="card-head">
          <h2>Stamped</h2>
          <small className="muted">
            {matches.length} {matches.length === 1 ? "country" : "countries"}
          </small>
        </div>
        {matches.length === 0 && <p className="empty">No stamps yet. A stamp only lands when you've both swiped right.</p>}
        <div className="stamps">
          {[...matches].reverse().map((m) => {
            const c = COUNTRY.get(m.country);
            return (
              <button key={m.country} className={`stamp ${m.super_by ? "super" : ""} ${trip?.country === m.country ? "trip" : ""}`} style={{ rotate: `${tilt(m.country)}deg` }} onClick={() => setStamp(m)}>
                <span className="stamp-flag">{flag(m.country)}</span>
                <b>{c?.name ?? m.country}</b>
                <small>{prettyDate(dayKey(m.matched_at), { day: "numeric", month: "short", year: "numeric" })}</small>
                {m.super_by && <i className="stamp-star">★</i>}
              </button>
            );
          })}
        </div>
      </section>

      {fresh.length > 0 && <MatchOverlay fresh={fresh} onClose={markSeen} />}
      {stamp && <StampSheet m={stamp} onClose={() => setStamp(null)} />}
      {sealing && <SealSheet onClose={() => setSealing(false)} />}
    </div>
  );
}

/* ---------------- The deck ---------------- */
function Deck({ cards, onSwipe, superUsed, canUndo, onUndo }: { cards: Country[]; onSwipe: (c: Country, ch: Choice) => void; superUsed: boolean; canUndo: boolean; onUndo: () => void }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, on: false });
  const [leaving, setLeaving] = useState<Choice | null>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const top = cards[0];

  const go = (choice: Choice) => {
    if (leaving || !top) return;
    if (choice === "super" && superUsed) return;
    setLeaving(choice);
    setTimeout(() => {
      onSwipe(top, choice);
      setLeaving(null);
      setDrag({ x: 0, y: 0, on: false });
    }, 260);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight") go("yes");
      else if (e.key === "ArrowLeft") go("no");
      else if (e.key === "ArrowUp") go("super");
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const down = (e: RPointerEvent) => {
    if (leaving) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDrag({ x: 0, y: 0, on: true });
  };
  const move = (e: RPointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, on: true });
  };
  const up = () => {
    if (!start.current) return;
    const { x, y } = drag;
    const fast = Math.abs(x) / Math.max(1, Date.now() - start.current.t) > 0.6;
    start.current = null;
    if (y < -110 && Math.abs(y) > Math.abs(x) && !superUsed) go("super");
    else if (x > 100 || (fast && x > 40)) go("yes");
    else if (x < -100 || (fast && x < -40)) go("no");
    else setDrag({ x: 0, y: 0, on: false });
  };

  const lean: Choice | null = leaving ?? (drag.y < -60 && Math.abs(drag.y) > Math.abs(drag.x) && !superUsed ? "super" : drag.x > 40 ? "yes" : drag.x < -40 ? "no" : null);
  const out = leaving === "yes" ? "translate(140%, 10%) rotate(24deg)" : leaving === "no" ? "translate(-140%, 10%) rotate(-24deg)" : leaving === "super" ? "translate(0, -150%) scale(.9)" : null;

  return (
    <section className="deck-wrap">
      <div className="deck">
        {[...cards].reverse().map((c, i, arr) => {
          const depth = arr.length - 1 - i;
          const isTop = depth === 0;
          return (
            <div
              key={c.code}
              className={`country-card region-${c.region.toLowerCase()} ${isTop ? "top" : ""} ${isTop && drag.on ? "dragging" : ""}`}
              style={
                isTop
                  ? { transform: out ?? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)` }
                  : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})` }
              }
              onPointerDown={isTop ? down : undefined}
              onPointerMove={isTop ? move : undefined}
              onPointerUp={isTop ? up : undefined}
              onPointerCancel={isTop ? up : undefined}
              aria-hidden={!isTop}
            >
              {isTop && (
                <>
                  <span className={`verdict yes ${lean === "yes" ? "show" : ""}`}>Let's go</span>
                  <span className={`verdict no ${lean === "no" ? "show" : ""}`}>Nope</span>
                  <span className={`verdict super ${lean === "super" ? "show" : ""}`}>Super Like</span>
                </>
              )}
              <CardFace c={c} />
            </div>
          );
        })}
      </div>
      <div className="deck-btns">
        <button className="round small" onClick={onUndo} disabled={!canUndo} aria-label="Take back the last swipe">
          <Icon name="undo" size={20} />
        </button>
        <button className="round no" onClick={() => go("no")} aria-label="Nope">
          <Icon name="close" size={28} />
        </button>
        <button className="round super" onClick={() => go("super")} disabled={superUsed} aria-label={superUsed ? "Super Like used" : "Super Like"}>
          <Icon name="star" size={24} />
        </button>
        <button className="round yes" onClick={() => go("yes")} aria-label="Let's go">
          <Icon name="us" size={28} />
        </button>
      </div>
      <p className="small muted deck-help">
        Right for yes, left for no, up for your one Super Like{superUsed ? " (used)" : ""}. Only countries you <i>both</i> say yes to get stamped. A Super Like overrules their no.
      </p>
    </section>
  );
}

function CardFace({ c }: { c: Country }) {
  const { t } = useChez();
  const name = c.name.replace(/ \(.*\)$/, "").toLowerCase();
  const pinned = t.pins.filter((p) => `${p.title} ${p.place ?? ""}`.toLowerCase().includes(name));
  return (
    <div className="card-face">
      <span className="card-flag">{flag(c.code)}</span>
      <h2>{c.name}</h2>
      <p className="card-meta">{c.capital ? `${c.capital} · ${c.subregion}` : c.subregion}</p>
      {pinned.length > 0 && (
        <p className="card-pin">
          <Icon name="board" size={15} /> On the Board: {pinned.map((p) => p.title).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ---------------- It's a match ---------------- */
function MatchOverlay({ fresh, onClose }: { fresh: PassportMatch[]; onClose: () => void }) {
  const { me, them } = useChez();
  const one = fresh.length === 1 ? fresh[0] : null;
  const c = one ? COUNTRY.get(one.country) : null;
  const theirSuper = one?.super_by && one.super_by !== me.who && one.super_by !== "both";
  return createPortal(
    <div className="match-back" onClick={onClose}>
      <div className="match" role="dialog" aria-modal="true" aria-label="It's a match">
        <p className="kicker">Passport</p>
        <h2>{one ? "It's a match ✈️" : `${fresh.length} new stamps ✈️`}</h2>
        {one && c ? (
          <>
            <div className="match-stamp">
              <span>{flag(c.code)}</span>
            </div>
            <p>
              You both want to go to <b>{c.name}</b>.
            </p>
            {one.super_by === "both" && <p className="small">You both used your Super Like on it. Of course you did.</p>}
            {one.super_by === me.who && <p className="small">Your Super Like got it in.</p>}
            {theirSuper && <p className="small">{them} used their Super Like on this one.</p>}
          </>
        ) : (
          <div className="match-many">
            {fresh.slice(0, 12).map((m) => (
              <span key={m.country} title={COUNTRY.get(m.country)?.name}>
                {flag(m.country)}
              </span>
            ))}
            <p>
              {fresh
                .slice(0, 4)
                .map((m) => COUNTRY.get(m.country)?.name ?? m.country)
                .join(", ")}
              {fresh.length > 4 ? ` and ${fresh.length - 4} more` : ""}.
            </p>
          </div>
        )}
        <button className="btn gold wide" onClick={onClose}>
          Keep swiping
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Sealing, and the first trip ---------------- */
function SealSheet({ onClose }: { onClose: () => void }) {
  const { me, them, reload } = useChez();
  const { busy, error, run } = useAction();
  return (
    <Sheet title="Seal your passport?" onClose={onClose}>
      <p>Once it's sealed, every swipe is final: no taking any back.</p>
      <p className="muted">
        When {them} seals theirs too, one of your stamps is drawn at random as the first trip you'll take together. You both see it at the same moment. No rerolls.
      </p>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const drawn = await store.sealPassport();
            void store.notify(drawn ? "The first trip has been drawn ✈️" : "Passport sealed", drawn ? "Open the Passport to see where you're going." : `${me.name} has sealed their passport. Your turn.`);
            await reload();
            onClose();
          })
        }
      >
        {busy ? "Sealing…" : "Seal it"}
      </button>
    </Sheet>
  );
}

function FirstTrip({ code, drawnAt }: { code: string; drawnAt: string }) {
  const { me } = useChez();
  const key = `chez:passport-trip-seen:${me.user_id}`;
  const [shown, setShown] = useState(() => read(key).includes(code));
  const [flipping, setFlipping] = useState(false);
  const c = COUNTRY.get(code);
  return (
    <section className={`trip-card ${shown ? "open" : ""} ${flipping ? "flipping" : ""}`}>
      {shown && c ? (
        <>
          <p className="kicker">The first trip</p>
          <span className="trip-flag">{flag(code)}</span>
          <h2>{c.name}</h2>
          <p className="muted">{c.capital ? `${c.capital} · ${c.subregion}` : c.subregion}</p>
          <p className="small muted">Drawn {prettyDate(dayKey(drawnAt))}. The passport has spoken.</p>
        </>
      ) : (
        <>
          <p className="kicker">The first trip</p>
          <div className="trip-sealed">✈</div>
          <h2>It's been drawn</h2>
          <p className="muted">One of your stamps. You'll both see the same one.</p>
          <button
            className="btn gold wide"
            onClick={() => {
              setFlipping(true);
              setTimeout(() => {
                write(key, [...read(key), code]);
                setShown(true);
                setFlipping(false);
              }, 700);
            }}
          >
            Reveal
          </button>
        </>
      )}
    </section>
  );
}

/* ---------------- One stamp ---------------- */
function StampSheet({ m, onClose }: { m: PassportMatch; onClose: () => void }) {
  const { me, t, them, add } = useChez();
  const { busy, error, run } = useAction();
  const c = COUNTRY.get(m.country);
  const name = c?.name ?? m.country;
  const pinned = t.pins.some((p) => p.title === name && p.kind === "place");
  return (
    <Sheet title={name} onClose={onClose}>
      <div className="stamp-big">{flag(m.country)}</div>
      {c && <p className="muted center">{c.capital ? `${c.capital} · ${c.subregion}` : c.subregion}</p>}
      <p className="center">Stamped {prettyDate(dayKey(m.matched_at))}.</p>
      {m.super_by === "both" && <p className="small center">You both Super Liked it.</p>}
      {m.super_by === me.who && <p className="small center">Your Super Like got it in.</p>}
      {m.super_by && m.super_by !== "both" && m.super_by !== me.who && <p className="small center">{them}'s Super Like got it in.</p>}
      {error && <p className="err">{error}</p>}
      <button
        className="btn wide"
        disabled={busy || pinned}
        onClick={() =>
          run(async () => {
            await add("pins", { title: name, place: c?.subregion ?? null, kind: "place", note: "Stamped in the Passport ✈️" });
            onClose();
          })
        }
      >
        {pinned ? "Already on the Board" : "Pin it to the Board"}
      </button>
    </Sheet>
  );
}
