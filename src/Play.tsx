import { useEffect, useMemo, useState } from "react";
import { clock } from "./audio";
import { useChez } from "./data";
import { dayKey, duelResults, plural } from "./logic";
import { puzzleFor } from "./sudoku";
import { prettyDate, useAction } from "./ui";

type Saved = { start: number; entries: number[]; mistakes: number; notes: number[][] };

export default function Play() {
  const { me, partner, t, now, them } = useChez();
  const today = dayKey(now);
  const mine = t.duels.find((d) => d.day === today && d.by === me.user_id);
  const theirs = partner ? t.duels.find((d) => d.day === today && d.by === partner.user_id) : undefined;
  const results = duelResults(t.duels, [me, ...(partner ? [partner] : [])], now);
  const past = [...results.days.entries()].filter(([d]) => d !== today).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="page play">
      <header className="page-head">
        <p className="kicker">Daily duel</p>
        <h1>Sudoku</h1>
        <p className="muted">Same puzzle for both of you. Fastest wins; each mistake adds 10 seconds.</p>
      </header>
      <div className="record">
        <div>
          <b>{results.wins[me.user_id] ?? 0}</b>
          <small>you</small>
        </div>
        <span>days won</span>
        <div>
          <b>{partner ? results.wins[partner.user_id] ?? 0 : 0}</b>
          <small>{them}</small>
        </div>
      </div>

      {mine ? (
        <section className="card result">
          <h2>Today: {clock(mine.seconds)}</h2>
          <p className="muted">{plural(mine.mistakes, "mistake")}</p>
          {theirs ? (
            <p className="verdict-line">
              {them}: {clock(theirs.seconds)}, {plural(theirs.mistakes, "mistake")}.{" "}
              <b>
                {results.days.get(today)?.winner === me.user_id ? "You win today." : results.days.get(today)?.winner ? `${them} wins today.` : "A dead heat."}
              </b>
            </p>
          ) : (
            <p className="muted">Waiting for {them}. Your time stays hidden from them until they finish too.</p>
          )}
        </section>
      ) : playing ? (
        <Board day={today} />
      ) : (
        <section className="card start-duel">
          <h2>Today's puzzle</h2>
          <p className="muted">{theirs ? `${them} has already played. Their time is hidden until you finish.` : `${them} hasn't played yet.`}</p>
          <button className="btn primary wide" onClick={() => setPlaying(true)}>
            Start the clock
          </button>
        </section>
      )}

      {past.length > 0 && (
        <section className="card">
          <h2>Recent days</h2>
          <ul className="past">
            {past.map(([day, r]) => (
              <li key={day}>
                <span>{prettyDate(day, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="muted">{r.times[me.user_id] ? clock(r.times[me.user_id].seconds) : "—"}</span>
                <span className="muted">{partner && r.times[partner.user_id] ? clock(r.times[partner.user_id].seconds) : "—"}</span>
                <b>{r.winner === me.user_id ? "You" : r.winner ? them : "—"}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Board({ day }: { day: string }) {
  const { me, add } = useChez();
  const { puzzle, solution } = useMemo(() => puzzleFor(day), [day]);
  const key = `chez:duel:${day}:${me.user_id}`;
  const [s, setS] = useState<Saved>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Saved;
    } catch {
      // fresh start
    }
    return { start: Date.now(), entries: [...puzzle], mistakes: 0, notes: Array.from({ length: 81 }, () => []) };
  });
  const [sel, setSel] = useState<number | null>(null);
  const [noting, setNoting] = useState(false);
  const [wrong, setWrong] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());
  const { error, run } = useAction();

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      // keeps going without saving
    }
  }, [key, s]);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const done = s.entries.every((v, i) => v === solution[i]);
  useEffect(() => {
    if (!done) return;
    const seconds = Math.max(1, Math.round((Date.now() - s.start) / 1000));
    void run(() => add("duels", { day, seconds, mistakes: s.mistakes }, ["Daily duel", `${me.name} finished today's puzzle. Your move.`]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const enter = (v: number) => {
    if (sel === null || puzzle[sel]) return;
    if (noting) {
      setS((x) => ({ ...x, notes: x.notes.map((n, i) => (i === sel ? (n.includes(v) ? n.filter((k) => k !== v) : [...n, v].sort()) : n)) }));
      return;
    }
    if (v === 0) return setS((x) => ({ ...x, entries: x.entries.map((e, i) => (i === sel ? 0 : e)) }));
    if (solution[sel] !== v) {
      setWrong(sel);
      setTimeout(() => setWrong(null), 600);
      setS((x) => ({ ...x, mistakes: x.mistakes + 1 }));
      return;
    }
    setS((x) => ({ ...x, entries: x.entries.map((e, i) => (i === sel ? v : e)), notes: x.notes.map((n, i) => (i === sel ? [] : n)) }));
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) enter(Number(e.key));
      if (e.key === "Backspace") enter(0);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const selVal = sel !== null ? s.entries[sel] : 0;
  const counts = Array.from({ length: 10 }, (_, v) => s.entries.filter((e) => e === v).length);
  return (
    <section className="sudoku">
      <div className="sudoku-top">
        <span className="timer">{clock(Math.round((tick - s.start) / 1000))}</span>
        <span className="muted">{plural(s.mistakes, "mistake")}</span>
      </div>
      <div className="grid" role="grid" aria-label="Sudoku">
        {s.entries.map((v, i) => {
          const r = Math.floor(i / 9);
          const c = i % 9;
          const related = sel !== null && (Math.floor(sel / 9) === r || sel % 9 === c || (Math.floor(sel / 27) === Math.floor(i / 27) && Math.floor((sel % 9) / 3) === Math.floor(c / 3)));
          return (
            <button
              key={i}
              role="gridcell"
              className={["cell", puzzle[i] ? "given" : "", sel === i ? "sel" : "", related ? "rel" : "", v && v === selVal ? "same" : "", wrong === i ? "wrong" : "", c % 3 === 2 && c < 8 ? "br" : "", r % 3 === 2 && r < 8 ? "bb" : ""].join(" ")}
              onClick={() => setSel(i)}
              aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${v}` : ", empty"}`}
            >
              {v ? (
                v
              ) : s.notes[i].length ? (
                <span className="notes">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <i key={n}>{s.notes[i].includes(n) ? n : ""}</i>
                  ))}
                </span>
              ) : (
                ""
              )}
            </button>
          );
        })}
      </div>
      <div className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => enter(n)} disabled={counts[n] >= 9}>
            {n}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={`btn ${noting ? "primary" : ""}`} onClick={() => setNoting((x) => !x)} aria-pressed={noting}>
          Notes {noting ? "on" : "off"}
        </button>
        <button className="btn" onClick={() => enter(0)}>
          Erase
        </button>
      </div>
      {error && <p className="err">{error}</p>}
    </section>
  );
}
