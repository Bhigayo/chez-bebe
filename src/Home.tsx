import { useState } from "react";
import { useChez } from "./data";
import { checkinToday, crowns, dayKey, goalProgress, greetingStreak, greetingToday, isQuiet, plural, recentHere, together, upcoming, type Upcoming } from "./logic";
import { Icon, MOOD_WORD, MoodIcon, Sheet, StoredImage, useAction, Voice, VoiceMaker, when, type VoiceResult } from "./ui";
import type { Checkin, Member, Mood } from "./types";

const REPLIES = {
  her: ["Acknowledged.", "Noted, citizen.", "tch", "❤️"],
  him: ["Good morning, Your Majesty.", "Yes, bébé ❤️", "🫡"],
};

const hello = (now: Date) => {
  const h = now.getHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
};

export default function Home() {
  const { me, partner, t, now, them, add, edit } = useChez();
  const [sheet, setSheet] = useState<null | "checkin" | "greet">(null);
  const herePing = useAction();
  const mine = checkinToday(t.checkins, me.user_id, now);
  const theirs = partner ? checkinToday(t.checkins, partner.user_id, now) : null;
  const theyAreQuiet = partner ? isQuiet(t.checkins, partner.user_id, now) : false;
  const iAmQuiet = isQuiet(t.checkins, me.user_id, now);
  const hereFromThem = partner ? recentHere(t.here, partner.user_id, now) : null;
  const hereFromMe = recentHere(t.here, me.user_id, now);
  const myGreeting = greetingToday(t.greetings, me.user_id, now);
  const theirGreeting = partner ? greetingToday(t.greetings, partner.user_id, now) : null;
  const myStreak = greetingStreak(t.greetings, me.user_id, now);

  const waiting = [
    ...t.decrees.filter((d) => d.by !== me.user_id && !d.done_at).map((d) => ({ id: d.id, kind: "Decree", text: d.text, href: "#/court/decrees" })),
    ...t.cases.filter((c) => c.by !== me.user_id && !c.defence && !c.verdict).map((c) => ({ id: c.id, kind: `${them} has filed a case`, text: c.title, href: "#/court" })),
    ...t.cases.filter((c) => c.by === me.user_id && c.defence && !c.verdict).map((c) => ({ id: c.id, kind: "Ready for your ruling", text: c.title, href: "#/court" })),
  ];

  let seenBoard = "";
  try {
    seenBoard = localStorage.getItem(`chez:seen-board:${me.user_id}`) ?? "";
  } catch {
    // fine
  }
  const newPins = t.pins.filter((p) => p.by !== me.user_id && p.created_at > seenBoard);

  const today = dayKey(now);
  const myDuel = t.duels.find((d) => d.day === today && d.by === me.user_id);
  const theirDuel = partner && t.duels.find((d) => d.day === today && d.by === partner.user_id);

  const earned = crowns(t, [me, ...(partner ? [partner] : [])], now);
  const progress = goalProgress(t.goals, [me, ...(partner ? [partner] : [])], earned);
  const activeGoals = (["her", "him"] as const)
    .map((who) => t.goals.filter((g) => g.for_who === who).sort((a, b) => a.created_at.localeCompare(b.created_at)).find((g) => !progress.get(g.id)?.achieved))
    .filter(Boolean);

  const anniversary = t.dates.find((d) => d.kind === "anniversary");
  const coming = upcoming(t.dates, t.settings.find((s) => s.key === "first_meeting")?.value ?? null, now);
  const todays = coming.filter((u) => u.inDays === 0 && u.kind !== "first-meeting");
  const next = coming.find((u) => u.inDays > 0);
  const since = anniversary ? together(anniversary.date, now) : null;

  return (
    <div className="page home">
      <header className="hello">
        <p className="kicker">{hello(now)}</p>
        <h1>{me.name}</h1>
        <p className="muted">{me.title}</p>
        {since && since.total > 0 && (
          <p className="together">
            Together {since.months ? `${plural(since.months, "month")}${since.days ? `, ${plural(since.days, "day")}` : ""}` : plural(since.days, "day")}
          </p>
        )}
      </header>

      {todays.map((u) => (
        <TodayMoment key={u.title + u.kind} u={u} />
      ))}

      {hereFromThem && (
        <div className="here-glow" role="status">
          <span className="here-heart" aria-hidden="true">
            <Icon name="us" size={26} />
          </span>
          <div>
            <b>{them} is here.</b>
            <p className="muted small">{when(hereFromThem.created_at, now)}. No need to reply.</p>
          </div>
        </div>
      )}

      {theyAreQuiet && (
        <div className="quiet-card">
          <p className="kicker">Quiet day</p>
          <h2>{them} is having a rough day.</h2>
          <p>Banter is paused until it gets better. No jokes. Just be there.</p>
          {hereFromMe ? (
            <p className="muted small">You're here. They'll see it.</p>
          ) : (
            <button className="btn primary" disabled={herePing.busy} onClick={() => herePing.run(() => add("here", {}, ["Chez Bébé", `${me.name} is here.`]))}>
              <Icon name="us" size={18} /> I'm here
            </button>
          )}
          {herePing.error && <p className="err">{herePing.error}</p>}
        </div>
      )}

      <section className="card weather">
        <div className="card-head">
          <h2>Today at Chez Bébé</h2>
          <button className="btn small" onClick={() => setSheet("checkin")}>
            {mine ? "Update" : "How's your day?"}
          </button>
        </div>
        <div className="weather-grid">
          <Forecast who={me} c={mine} you />
          {partner && <Forecast who={partner} c={theirs} />}
        </div>
        {theirs?.note && (
          <blockquote className="note-for-you">
            <small>A note for you</small>
            {theirs.note}
          </blockquote>
        )}
        {iAmQuiet && <p className="muted small">Everything's paused for you today. Feeling better? Update your day.</p>}
      </section>

      <section className="card greet">
        <div className="card-head">
          <h2>Good morning</h2>
          {myStreak > 0 && <span className="streak">{plural(myStreak, "day")} in a row</span>}
        </div>
        {theirGreeting && (
          <div className="greeting">
            <p className="greeting-text">“{theirGreeting.text}”</p>
            <small className="muted">From {them}, {when(theirGreeting.created_at, now)}</small>
            {theirGreeting.reply ? (
              <p className="reply-done">You replied: {theirGreeting.reply}</p>
            ) : (
              <div className="chips">
                {REPLIES[me.who].map((r) => (
                  <button key={r} className="chip" onClick={() => edit("greetings", theirGreeting.id, { reply: r, replied_at: new Date().toISOString() }, ["Chez Bébé", `${me.name}: ${r}`])}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {myGreeting ? (
          <p className="muted small">
            Yours is sent{myGreeting.reply ? `. ${them} replied: “${myGreeting.reply}”` : `. Awaiting ${me.who === "him" ? "Her Majesty's" : "their"} response.`}
          </p>
        ) : (
          <button className="btn primary wide" onClick={() => setSheet("greet")}>
            Send your good morning
          </button>
        )}
      </section>

      {waiting.length > 0 && !iAmQuiet && (
        <section className="card">
          <h2>Waiting for you</h2>
          <ul className="waiting">
            {waiting.map((w) => (
              <li key={w.id}>
                <a href={w.href}>
                  <small>{w.kind}</small>
                  <span>{w.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="duo">
        <a className="card mini" href="#/board" onClick={() => markBoardSeen(me.user_id)}>
          <small className="kicker">The Board</small>
          {newPins.length ? <b>{plural(newPins.length, "new property")} from {them}</b> : <b>{plural(t.pins.length, "pin")}</b>}
        </a>
        <a className="card mini" href="#/play">
          <small className="kicker">Today's duel</small>
          <b>{myDuel ? (theirDuel ? "Both done. See who won" : `Done. Waiting for ${them}`) : theirDuel ? `${them} has played. Your turn` : "Not played yet"}</b>
        </a>
      </div>

      {activeGoals.length > 0 && (
        <section className="card">
          <h2>Saving up</h2>
          {activeGoals.map((g) => {
            const p = progress.get(g!.id)!;
            const pin = t.pins.find((x) => x.id === g!.pin_id);
            return (
              <div className="goal" key={g!.id}>
                {pin?.image && <StoredImage path={pin.image} className="goal-img" />}
                <div className="goal-body">
                  <div className="goal-top">
                    <b>{g!.title}</b>
                    <small>
                      {p.saved.toLocaleString()} / {p.target.toLocaleString()} <Icon name="crown" size={13} />
                    </small>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${(p.saved / p.target) * 100}%` }} />
                  </div>
                  <small className="muted">{p.earner?.user_id === me.user_id ? "You're earning this" : `${p.earner?.name ?? "They"} ${p.earner ? "is" : "are"} earning this`}</small>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {next && (
        <a className="card next" href="#/us/timeline">
          <small className="kicker">{next.kind === "first-meeting" ? "The big one" : "Coming up"}</small>
          <b>{label(next)}</b>
          <span className="muted">{next.inDays === 1 ? "Tomorrow" : `In ${plural(next.inDays, "day")}`}</span>
        </a>
      )}

      {sheet === "checkin" && <CheckIn onClose={() => setSheet(null)} current={mine} />}
      {sheet === "greet" && <Greet onClose={() => setSheet(null)} />}
    </div>
  );
}

export const markBoardSeen = (id: string) => {
  try {
    localStorage.setItem(`chez:seen-board:${id}`, new Date().toISOString());
  } catch {
    // fine
  }
};

export const label = (u: Upcoming) =>
  u.kind === "monthly" ? `${plural(u.months ?? 0, "month")}: ${u.title}` : u.kind === "yearly" ? `${plural(u.years ?? 0, "year")}: ${u.title}` : u.title;

function TodayMoment({ u }: { u: Upcoming }) {
  return (
    <section className="moment">
      <p className="kicker">Today</p>
      <h2>{label(u)}</h2>
      {u.note && <p>{u.note}</p>}
    </section>
  );
}

function Forecast({ who, c, you }: { who: Member; c: Checkin | null; you?: boolean }) {
  return (
    <div className="forecast">
      <MoodIcon mood={c?.mood ?? null} />
      <b>{you ? "You" : who.name}</b>
      <small className="muted">{c ? MOOD_WORD[c.mood] : "Not checked in yet"}</small>
      {c?.line && <p className="line">{c.line}</p>}
      {c?.audio && <Voice path={c.audio} peaks={null} />}
    </div>
  );
}

function CheckIn({ onClose, current }: { onClose: () => void; current: Checkin | null }) {
  const { me, t, them, add } = useChez();
  const [mood, setMood] = useState<Mood | null>(current?.mood ?? null);
  const [line, setLine] = useState("");
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [writing, setWriting] = useState("");
  const { busy, error, run } = useAction();
  const notes = t.saved_notes.filter((n) => n.by === me.user_id);
  return (
    <Sheet title="How's your day?" onClose={onClose}>
      <div className="moods">
        {(["sun", "cloud", "rain"] as Mood[]).map((m) => (
          <button key={m} className={`mood-btn ${mood === m ? "on" : ""}`} onClick={() => setMood(m)} aria-pressed={mood === m}>
            <MoodIcon mood={m} size={46} />
            <span>{MOOD_WORD[m]}</span>
          </button>
        ))}
      </div>
      {mood === "rain" && <p className="muted small">{them} will see it, and banter pauses for you until it gets better.</p>}
      <label className="field">
        <span>One line (optional)</span>
        <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={140} placeholder="Long shift. Thinking about you." />
      </label>
      <div className="field">
        <span>Or a quick voice note</span>
        <VoiceMaker onDone={setVoice} />
      </div>
      <div className="field">
        <span>Send a note with it</span>
        <div className="note-pick">
          {notes.map((n) => (
            <button key={n.id} className={`note-chip ${note === n.text ? "on" : ""}`} onClick={() => setNote(note === n.text ? null : n.text)}>
              {n.text}
            </button>
          ))}
          <div className="note-new">
            <input value={writing} onChange={(e) => setWriting(e.target.value)} placeholder="Write one in your own words" maxLength={240} />
            <button
              className="btn small"
              disabled={!writing.trim()}
              onClick={async () => {
                const saved = await add("saved_notes", { text: writing.trim() });
                setNote(saved.text);
                setWriting("");
              }}
            >
              Save
            </button>
          </div>
        </div>
        <small className="muted">Saved notes stay here, ready for busy days.</small>
      </div>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!mood || busy}
        onClick={() =>
          run(async () => {
            await add("checkins", { mood: mood!, line: line.trim() || null, note, audio: voice?.path ?? null }, [
              "Chez Bébé",
              mood === "rain" ? `${me.name} is having a rough day.` : note ? `${me.name} sent you a note.` : `${me.name}: ${MOOD_WORD[mood!].toLowerCase()}.`,
            ]);
            onClose();
          })
        }
      >
        {busy ? "Saving…" : "Check in"}
      </button>
    </Sheet>
  );
}

function Greet({ onClose }: { onClose: () => void }) {
  const { me, t, them, add } = useChez();
  const last = [...t.greetings].reverse().find((g) => g.by === me.user_id)?.text ?? "";
  const [text, setText] = useState(last);
  const { busy, error, run } = useAction();
  return (
    <Sheet title="Good morning" onClose={onClose} tone="royal">
      <label className="field">
        <span>To {them}</span>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={me.who === "him" ? "Good morning to Her Imperial Majesty…" : "Good morning…"} />
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!text.trim() || busy}
        onClick={() =>
          run(async () => {
            await add("greetings", { text: text.trim() }, ["Good morning", `${me.name}: ${text.trim().slice(0, 120)}`]);
            onClose();
          })
        }
      >
        {busy ? "Sending…" : "Send"}
      </button>
    </Sheet>
  );
}
