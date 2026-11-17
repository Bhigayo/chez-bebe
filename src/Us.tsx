import { useState } from "react";
import { useChez } from "./data";
import { label } from "./Home";
import { dayKey, plural, together, upcoming } from "./logic";
import { store } from "./store";
import { Icon, prettyDate, Sheet, shrinkPhoto, StoredImage, useAction, Voice, VoiceMaker, type VoiceResult } from "./ui";
import type { KeyDate, Lore, Who } from "./types";

export default function Us({ tab }: { tab: "lore" | "timeline" }) {
  return (
    <div className="page us">
      <header className="page-head">
        <p className="kicker">Us</p>
        <h1>{tab === "lore" ? "The Lore" : "Timeline"}</h1>
        <nav className="seg">
          <a href="#/us" className={tab === "lore" ? "on" : ""}>
            Lore
          </a>
          <a href="#/us/timeline" className={tab === "timeline" ? "on" : ""}>
            Timeline
          </a>
        </nav>
      </header>
      {tab === "lore" ? <LoreList /> : <Timeline />}
    </div>
  );
}

const LORE_KINDS: { key: Lore["kind"]; label: string }[] = [
  { key: "quote", label: "Quote" },
  { key: "moment", label: "Moment" },
  { key: "photo", label: "Photo" },
  { key: "voice", label: "Voice note" },
];

function LoreList() {
  const { me, t, members, remove } = useChez();
  const [filter, setFilter] = useState<Lore["kind"] | "all">("all");
  const [adding, setAdding] = useState(false);
  const ordered = [...t.lore].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const number = new Map(ordered.map((l, i) => [l.id, i + 1]));
  const list = ordered.filter((l) => filter === "all" || l.kind === filter).reverse();
  const nameOf = (w: Who | null) => (w ? members.find((m) => m.who === w)?.name ?? w : null);
  return (
    <>
      <p className="muted">Quotes, moments, photos and voice notes. Everything in here can turn up again in games and on anniversaries.</p>
      <div className="board-bar">
        <nav className="filter">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            All
          </button>
          {LORE_KINDS.map((k) => (
            <button key={k.key} className={filter === k.key ? "on" : ""} onClick={() => setFilter(k.key)}>
              {k.label}s
            </button>
          ))}
        </nav>
        <button className="btn primary small" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      {list.length === 0 && <p className="empty">Nothing here yet. The first one is always the best one.</p>}
      <div className="lore">
        {list.map((l) => (
          <article key={l.id} className={`lore-item k-${l.kind}`}>
            <small className="lore-no">No. {String(number.get(l.id)).padStart(3, "0")}</small>
            {l.image && <StoredImage path={l.image} className="lore-img" />}
            {l.audio && <Voice path={l.audio} peaks={l.peaks} />}
            {l.text && (l.kind === "quote" ? <blockquote>“{l.text}”</blockquote> : <p>{l.text}</p>)}
            <footer>
              <small className="muted">
                {l.said_by ? `${nameOf(l.said_by)}${l.happened_on ? ", " : ""}` : ""}
                {l.happened_on ? prettyDate(l.happened_on, { day: "numeric", month: "short", year: "numeric" }) : !l.said_by ? prettyDate(dayKey(l.created_at), { day: "numeric", month: "short", year: "numeric" }) : ""}
              </small>
              {l.by === me.user_id && (
                <button className="icon-btn" aria-label="Remove" onClick={() => confirm("Remove this from the lore?") && remove("lore", l.id)}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      {adding && <AddLore onClose={() => setAdding(false)} />}
    </>
  );
}

function AddLore({ onClose }: { onClose: () => void }) {
  const { me, members, add } = useChez();
  const [kind, setKind] = useState<Lore["kind"]>("quote");
  const [text, setText] = useState("");
  const [saidBy, setSaidBy] = useState<Who | null>(me.who === "him" ? "her" : "him");
  const [date, setDate] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const { busy, error, run } = useAction();
  const name = (w: Who) => (w === me.who ? "Me" : members.find((m) => m.who === w)?.name ?? w);
  const ready = kind === "voice" ? !!voice : kind === "photo" ? !!photo : !!text.trim();
  return (
    <Sheet title="Add to the lore" onClose={onClose}>
      <div className="seg-btns">
        {LORE_KINDS.map((k) => (
          <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {kind === "voice" && (
        <div className="field">
          <span>The voice note</span>
          <VoiceMaker onDone={setVoice} hint="From Instagram or WhatsApp? Screen-record it playing, then upload the recording. Only the sound is kept, and you can trim it." />
        </div>
      )}
      {(kind === "photo" || kind === "moment") && (
        <label className={`photo-drop small ${photo ? "has" : ""}`}>
          {photo ? <img src={URL.createObjectURL(photo)} alt="" /> : <><Icon name="photo" size={24} /><span>{kind === "photo" ? "Choose a photo" : "Add a photo (optional)"}</span></>}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
        </label>
      )}
      <label className="field">
        <span>{kind === "quote" ? "The quote" : kind === "moment" ? "What happened" : "Caption (optional)"}</span>
        <textarea rows={kind === "moment" ? 4 : 2} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "quote" ? "your efforts have been noted, citizen" : ""} />
      </label>
      {(kind === "quote" || kind === "voice") && (
        <div className="field">
          <span>Said by</span>
          <div className="seg-btns">
            {(["her", "him"] as Who[]).map((w) => (
              <button key={w} className={saidBy === w ? "on" : ""} onClick={() => setSaidBy(w)}>
                {name(w)}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="field">
        <span>When (optional)</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={dayKey()} />
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!ready || busy}
        onClick={() =>
          run(async () => {
            const image = photo ? await store.upload(await shrinkPhoto(photo), "jpg") : null;
            await add(
              "lore",
              {
                kind,
                text: text.trim() || null,
                said_by: kind === "quote" || kind === "voice" ? saidBy : null,
                image,
                audio: voice?.path ?? null,
                peaks: voice?.peaks ?? null,
                trim_start: null,
                trim_end: null,
                happened_on: date || null,
              },
              ["The Lore", `${me.name} added ${kind === "voice" ? "a voice note" : kind === "photo" ? "a photo" : `a ${kind}`} to the lore.`],
            );
            onClose();
          })
        }
      >
        {busy ? "Saving…" : "Add it"}
      </button>
    </Sheet>
  );
}

function Timeline() {
  const { me, t, now, get, setting, remove } = useChez();
  const [adding, setAdding] = useState(false);
  const [settingDate, setSettingDate] = useState(false);
  const [meet, setMeet] = useState("");
  const first = get("first_meeting");
  const anniversary = t.dates.find((d) => d.kind === "anniversary");
  const since = anniversary ? together(anniversary.date, now) : null;
  const coming = upcoming(t.dates, first, now).slice(0, 8);
  const today = dayKey(now);
  const days = first ? Math.max(0, Math.round((Date.parse(`${first}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)) : null;
  const { error, run } = useAction();

  return (
    <>
      {since && (
        <section className="together-card">
          <small className="kicker">Together</small>
          <b>{since.total.toLocaleString()}</b>
          <span>days since {prettyDate(anniversary!.date)}</span>
        </section>
      )}

      <section className={`first-meet ${first ? "set" : ""}`}>
        <small className="kicker">The first time in the same room</small>
        {first && days !== null ? (
          <>
            <b className="count">{days === 0 ? "Today." : plural(days, "day")}</b>
            <span>{prettyDate(first, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </>
        ) : (
          <b>Date: to be decided</b>
        )}
        {settingDate ? (
          <div className="row">
            <input type="date" value={meet} min={today} onChange={(e) => setMeet(e.target.value)} />
            <button className="btn primary small" disabled={!meet} onClick={() => run(async () => (await setting("first_meeting", meet), setSettingDate(false)))}>
              Save
            </button>
          </div>
        ) : (
          <button className="link" onClick={() => (setMeet(first ?? ""), setSettingDate(true))}>
            {first ? "Change the date" : "Set a date"}
          </button>
        )}
        {first && settingDate && (
          <button className="link" onClick={() => run(async () => (await setting("first_meeting", null), setSettingDate(false)))}>
            Clear it
          </button>
        )}
      </section>
      {error && <p className="err">{error}</p>}

      <section className="card">
        <h2>Coming up</h2>
        {coming.length === 0 && <p className="empty">Add your key dates below.</p>}
        <ul className="coming">
          {coming.map((u) => (
            <li key={u.title + u.date + u.kind} className={u.inDays === 0 ? "today" : ""}>
              <span>
                <b>{label(u)}</b>
                <small className="muted">{prettyDate(u.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</small>
              </span>
              <em>{u.inDays === 0 ? "Today" : u.inDays === 1 ? "Tomorrow" : `${u.inDays} days`}</em>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Our dates</h2>
          <button className="btn small" onClick={() => setAdding(true)}>
            Add
          </button>
        </div>
        <ul className="dates">
          {[...t.dates]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => (
              <li key={d.id}>
                <span className="date-dot" />
                <span>
                  <b>{d.title}</b>
                  <small className="muted">
                    {prettyDate(d.date)} · {d.kind === "anniversary" ? "every month, and every year" : d.kind === "yearly" ? "every year" : "once"}
                  </small>
                  {d.note && <p className="small">{d.note}</p>}
                </span>
                {d.by === me.user_id && (
                  <button className="icon-btn" aria-label={`Remove ${d.title}`} onClick={() => confirm(`Remove “${d.title}”?`) && remove("dates", d.id)}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>
      {adding && <AddDate onClose={() => setAdding(false)} />}
    </>
  );
}

function AddDate({ onClose }: { onClose: () => void }) {
  const { t, add } = useChez();
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<KeyDate["kind"]>("yearly");
  const { busy, error, run } = useAction();
  const hasAnniversary = t.dates.some((d) => d.kind === "anniversary");
  return (
    <Sheet title="Add a date" onClose={onClose}>
      <label className="field">
        <span>The date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>What happened</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="We matched" maxLength={60} />
      </label>
      <label className="field">
        <span>A line about it (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Chapter one." maxLength={160} />
      </label>
      <div className="field">
        <span>Remember it</span>
        <div className="seg-btns">
          <button className={kind === "yearly" ? "on" : ""} onClick={() => setKind("yearly")}>
            Every year
          </button>
          {!hasAnniversary && (
            <button className={kind === "anniversary" ? "on" : ""} onClick={() => setKind("anniversary")}>
              Our anniversary
            </button>
          )}
          <button className={kind === "once" ? "on" : ""} onClick={() => setKind("once")}>
            Just once
          </button>
        </div>
        {kind === "anniversary" && <small className="muted">Celebrated every month, and properly every year. "Together" counts from this date.</small>}
      </div>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!date || !title.trim() || busy}
        onClick={() =>
          run(async () => {
            await add("dates", { date, title: title.trim(), note: note.trim() || null, kind });
            onClose();
          })
        }
      >
        {busy ? "Saving…" : "Add it"}
      </button>
    </Sheet>
  );
}
