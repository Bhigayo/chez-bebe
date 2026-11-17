import { useState, type CSSProperties, type ReactNode } from "react";
import { useChez } from "./data";
import { dayKey, keysTurned, letterReady } from "./logic";
import { store } from "./store";
import { Icon, prettyDate, Sheet, shrinkPhoto, StoredImage, useAction, Voice, VoiceMaker, when, type VoiceResult } from "./ui";
import type { Envelope, EnvelopeStyle, LetterContent, Occasion, Paper, Seal, Tab } from "./types";

const SEALS: { key: Seal; label: string; titles: string[] }[] = [
  {
    key: "when",
    label: "Open when…",
    titles: [
      "Open when you miss me",
      "Open when you've had a bad day",
      "Open when you're overthinking",
      "Open when you're stressed",
      "Open when you can't sleep",
      "Open when you're homesick",
      "Open when you don't feel confident",
      "Open when you need to know how much I love you",
      "Open when you're jealous",
      "Open when I'm mad at you",
      "Open when we've had an argument",
      "Open when you're thinking about our future",
      "Open when you need a laugh",
    ],
  },
  { key: "date", label: "On a date", titles: ["For your birthday", "For our first month", "For your graduation"] },
  { key: "now", label: "Open now!", titles: ["Open now!"] },
  { key: "meeting", label: "When we meet", titles: ["For the first time in the same room"] },
  { key: "wedding", label: "Wedding day", titles: ["For our wedding day"] },
];
const OCCASION: Record<Occasion, { name: string; how: string }> = {
  meeting: { name: "The first time in the same room", how: "When you're finally together, you both turn your keys, and those letters open." },
  wedding: { name: "The wedding day", how: "On the day, you both turn your keys, and those letters open. Neither of you can open them alone." },
};
const STYLES: EnvelopeStyle[] = ["hearts", "clouds", "sunburst", "balloon", "rings", "corners", "stripes", "kraft"];
const PAPERS: { key: Paper; label: string }[] = [
  { key: "cream", label: "Writing paper" },
  { key: "lined", label: "Notebook" },
  { key: "kraft", label: "Brown kraft" },
];
const TAB_IDEAS = ["Inspiration", "Confidence", "Strength", "Happiness", "Laughter", "Peace", "A hug", "Patience"];

const lowerFirst = (x: string) => x[0].toLowerCase() + x.slice(1);
/** A sensible front for each kind of letter, until you pick one */
const styleFor = (title: string, seal: Seal): EnvelopeStyle =>
  seal === "now" ? "stripes" : seal === "wedding" ? "rings" : /sad|bad day|stress|homesick/i.test(title) ? "clouds" : /birthday|confident/i.test(title) ? "balloon" : /miss|get this/i.test(title) ? "sunburst" : /love|loved/i.test(title) ? "hearts" : /overthink|argument|mad/i.test(title) ? "corners" : "kraft";

export const sealLine = (e: Pick<Envelope, "seal" | "open_on">, ready: boolean) =>
  e.seal === "when"
    ? "Whenever the moment comes"
    : e.seal === "now"
      ? "Open it now"
      : ready
        ? "Ready to open"
        : e.seal === "date"
          ? `Opens ${prettyDate(e.open_on!, { day: "numeric", month: "long", year: "numeric" })}`
          : e.seal === "meeting"
            ? "Opens when you're in the same room"
            : "Opens on your wedding day";

export default function Vault() {
  const { me, partner, t, now, them, reload } = useChez();
  const [writing, setWriting] = useState<{ id: string; content: LetterContent; env: Envelope } | "new" | null>(null);
  const [reading, setReading] = useState<{ env: Envelope; content: LetterContent } | null>(null);
  const [asking, setAsking] = useState<Envelope | null>(null);
  const [cracking, setCracking] = useState<string | null>(null);
  const { error, run } = useAction();

  const forMe = t.vault_letters.filter((e) => e.by !== me.user_id).sort((a, b) => Number(b.seal === "now") - Number(a.seal === "now") || a.created_at.localeCompare(b.created_at));
  const fromMe = t.vault_letters.filter((e) => e.by === me.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const ready = forMe.filter((e) => !e.opened_at && letterReady(e, t.vault_unlocks, now));
  const sealed = forMe.filter((e) => !e.opened_at && !letterReady(e, t.vault_unlocks, now));
  const opened = forMe.filter((e) => e.opened_at).sort((a, b) => b.opened_at!.localeCompare(a.opened_at!));
  const occasions = (["meeting", "wedding"] as Occasion[]).filter((o) => t.vault_letters.some((e) => e.seal === o) && !t.vault_unlocks.some((u) => u.occasion === o));

  const open = (env: Envelope) =>
    run(async () => {
      if (env.by === me.user_id) {
        setWriting({ id: env.id, env, content: await store.openLetter(env.id) });
        return;
      }
      const first = !env.opened_at;
      if (first) setCracking(env.id);
      const content = await store.openLetter(env.id);
      if (first) {
        await new Promise((r) => setTimeout(r, 900));
        void store.notify("The Vault", `${me.name} opened “${env.title}”`, "vault");
        void reload();
      }
      setCracking(null);
      setReading({ env, content });
    }).finally(() => setCracking(null));

  return (
    <div className="vault-room">
      <header className="vault-top">
        <span className="vault-mark">
          <span className="wax small" aria-hidden="true">
            <i>B</i>
          </span>
          The Vault
        </span>
        <button className="btn small gold" onClick={() => setWriting("new")}>
          Write a letter
        </button>
      </header>
      <div className="vault-head">
        <h1>Letters for later</h1>
        <p className="vault-sub">Sealed until their moment. Not even the database will show the words before then.</p>
      </div>
      {error && <p className="err">{error}</p>}

      {ready.length > 0 && (
        <section>
          <h2 className="vault-h">Ready for you</h2>
          <div className="envs">
            {ready.map((e) => (
              <EnvelopeCard key={e.id} env={e} ready line={`From ${them} · ${sealLine(e, true)}`} cracking={cracking === e.id} onOpen={() => (e.seal === "when" ? setAsking(e) : open(e))} />
            ))}
          </div>
        </section>
      )}

      {occasions.map((o) => (
        <Keys key={o} occasion={o} />
      ))}

      <section>
        <h2 className="vault-h">Sealed for you</h2>
        {sealed.length === 0 && <p className="vault-empty">{forMe.length ? "Nothing still sealed. For now." : `Nothing from ${them} yet.`}</p>}
        <div className="envs">
          {sealed.map((e) => (
            <EnvelopeCard key={e.id} env={e} line={`From ${them} · ${sealLine(e, false)}`} />
          ))}
        </div>
      </section>

      {opened.length > 0 && (
        <section>
          <h2 className="vault-h">Opened</h2>
          <div className="envs small">
            {opened.map((e) => (
              <EnvelopeCard key={e.id} env={e} opened line={`Opened ${when(e.opened_at!, now)}`} onOpen={() => open(e)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="vault-h">Your letters to {them}</h2>
        {fromMe.length === 0 && <p className="vault-empty">You haven't sealed any yet.</p>}
        <div className="envs small">
          {fromMe.map((e) => (
            <EnvelopeCard
              key={e.id}
              env={e}
              opened={!!e.opened_at}
              onOpen={() => open(e)}
              line={e.opened_at ? `${them} opened it ${when(e.opened_at, now)}` : `Sealed · ${lowerFirst(sealLine(e, false))}`}
            />
          ))}
        </div>
      </section>

      {asking && (
        <Sheet title="Is this the moment?" onClose={() => setAsking(null)} tone="quiet">
          <p className="vault-ask">“{asking.title}”</p>
          <p className="muted small">Once it's open, {them} will know you opened it.</p>
          <button
            className="btn primary wide"
            onClick={() => {
              const e = asking;
              setAsking(null);
              void open(e);
            }}
          >
            Open it
          </button>
        </Sheet>
      )}
      {reading && (
        <LetterView
          env={reading.env}
          content={reading.content}
          from={partner?.name ?? them}
          onTear={async (i) => {
            const torn = await store.tearTab(reading.env.id, i);
            setReading((r) => (r ? { ...r, content: { ...r.content, torn } } : r));
            void store.notify("The Vault", `${me.name} took “${reading.content.tabs?.[i]?.label}”`, "vault");
          }}
          onClose={() => setReading(null)}
        />
      )}
      {writing && <Write existing={writing === "new" ? null : writing} onClose={() => setWriting(null)} />}
    </div>
  );
}

/* ---------------- Envelope fronts ---------------- */
/** "Open when you miss me" → small "Open when…" above, big "you miss me" */
const splitTitle = (title: string) => {
  const m = /^open when\b[\s.…]*(.*)$/i.exec(title.trim());
  return m && m[1] ? { kicker: "Open when…", main: m[1] } : { kicker: null, main: title };
};

function Doodle({ style }: { style: EnvelopeStyle }) {
  switch (style) {
    case "hearts":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true">
          {[
            [40, 60, 1],
            [250, 40, 0.8],
            [270, 150, 1.1],
            [30, 160, 0.7],
            [150, 28, 0.6],
            [200, 175, 0.8],
            [95, 175, 0.6],
          ].map(([x, y, s], i) => (
            <path key={i} d="M0 3C-3-3-9-1-9 4c0 5 9 10 9 10s9-5 9-10c0-5-6-7-9-1z" fill="#d23a3a" transform={`translate(${x} ${y}) scale(${s})`} />
          ))}
        </svg>
      );
    case "clouds":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true" fill="none" stroke="#3b4a52" strokeWidth="2.2">
          <path d="M18 168c-8 0-12-10-4-14 0-10 14-12 18-5 6-8 20-4 18 5 8 2 6 14-2 14z" />
          <path d="M226 50c-8 0-12-10-4-14 0-10 14-12 18-5 6-8 20-4 18 5 8 2 6 14-2 14z" />
          <path d="M232 178c-6 0-9-8-3-11 0-8 11-9 14-4 5-6 16-3 14 4 6 2 5 11-1 11z" />
        </svg>
      );
    case "sunburst":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true" stroke="#e0b100" strokeWidth="2.6" strokeLinecap="round">
          {Array.from({ length: 22 }, (_, i) => {
            const a = (i / 22) * Math.PI * 2;
            return <line key={i} x1={150 + Math.cos(a) * 112} y1={108 + Math.sin(a) * 64} x2={150 + Math.cos(a) * 128} y2={108 + Math.sin(a) * 74} />;
          })}
        </svg>
      );
    case "balloon":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true">
          <path d="M262 64c-7-13-30-9-30 9 0 16 30 34 30 34s30-18 30-34c0-18-23-22-30-9z" fill="#d62f3a" transform="translate(-12 -14) scale(0.9)" />
          <path d="M248 92c-4 22 10 40-2 70" stroke="#2a1b1a" strokeWidth="1.4" fill="none" />
        </svg>
      );
    case "rings":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true" fill="none" stroke="#2a1b1a" strokeWidth="2.4">
          <circle cx="138" cy="164" r="16" />
          <circle cx="160" cy="164" r="16" />
          <path d="M168 142l6-8 6 8-6 6z" stroke="#7a8b99" />
        </svg>
      );
    case "corners":
      return (
        <svg className="doodle" viewBox="0 0 300 200" aria-hidden="true" preserveAspectRatio="none">
          {[
            [0, 0],
            [300, 0],
            [0, 200],
            [300, 200],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="34" fill="#ea6a2a" />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

export function EnvelopeFront({ title, style, photo, cracking }: { title: string; style: EnvelopeStyle; photo?: string | null; cracking?: boolean }) {
  const { kicker, main } = splitTitle(title);
  // Long words get smaller letters instead of breaking in the middle
  const longest = Math.max(4, ...main.split(/\s+/).map((w) => w.length));
  return (
    <span className={`front ${photo ? "photo" : `s-${style}`}`} style={{ "--fit": `${100 / longest}cqi` } as CSSProperties}>
      {photo ? (
        <StoredImage path={photo} className="front-photo" alt={title} />
      ) : (
        <>
          <Doodle style={style} />
          {kicker && <span className="front-kicker">{kicker}</span>}
          <span className="front-title">{main}</span>
        </>
      )}
      <span className={`wax front-wax ${cracking ? "crack" : ""}`} aria-hidden="true">
        <i>B</i>
      </span>
    </span>
  );
}

function EnvelopeCard({ env, ready, opened, line, onOpen, cracking }: { env: Envelope; ready?: boolean; opened?: boolean; line: string; onOpen?: () => void; cracking?: boolean }) {
  const inner: ReactNode = (
    <>
      <EnvelopeFront title={env.title} style={env.envelope?.style ?? styleFor(env.title, env.seal)} photo={env.envelope_photo} cracking={cracking} />
      <span className="env-line">
        {!onOpen && <Icon name="key" size={14} />} {line}
      </span>
    </>
  );
  const cls = `env2 ${ready ? "ready" : ""} ${opened ? "opened" : ""} ${onOpen ? "" : "sealed"}`;
  return onOpen ? (
    <button className={cls} onClick={onOpen} disabled={cracking} aria-label={`${env.title}. ${line}`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Keys({ occasion }: { occasion: Occasion }) {
  const { me, partner, t, now, them, reload } = useChez();
  const { busy, error, run } = useAction();
  const turned = keysTurned(t.vault_keys, occasion, now);
  const mine = turned.includes(me.user_id);
  const theirs = !!partner && turned.includes(partner.user_id);
  const o = OCCASION[occasion];
  return (
    <section className="keys-card">
      <small className="kicker">Two keys</small>
      <h3>{o.name}</h3>
      <p>{o.how}</p>
      <div className="key-pair">
        <span className={mine ? "on" : ""}>
          <Icon name="key" size={20} /> You
        </span>
        <span className={theirs ? "on" : ""}>
          <Icon name="key" size={20} /> {them}
        </span>
      </div>
      {mine ? (
        <p className="small">You've turned yours. {theirs ? "" : `Waiting for ${them}, within 24 hours.`}</p>
      ) : (
        <button
          className="btn gold wide"
          disabled={busy}
          onClick={() =>
            run(async () => {
              if (!confirm(occasion === "wedding" ? "Is today the wedding day?" : "Are you really in the same room?")) return;
              const open = await store.turnKey(occasion);
              void store.notify("The Vault", open ? `Both keys are turned. The letters for ${o.name.toLowerCase()} are open.` : `${me.name} turned their key. Your turn.`, "vault");
              await reload();
            })
          }
        >
          Turn your key
        </button>
      )}
      {theirs && !mine && <p className="small">{them} has turned theirs. Your turn.</p>}
      {error && <p className="err">{error}</p>}
    </section>
  );
}

/* ---------------- The letter itself ---------------- */
function LetterBody({ content, title, from, sealedOn, onTear }: { content: LetterContent; title: string; from: string; sealedOn: string; onTear?: (i: number) => Promise<void> }) {
  const [tearing, setTearing] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const torn = content.torn ?? [];
  return (
    <div className={`paper p-${content.paper ?? "cream"}`}>
      <small className="paper-title">{title}</small>
      {content.image && (
        <span className="taped">
          <StoredImage path={content.image} className="letter-img" />
        </span>
      )}
      {content.body && <div className="letter-body">{content.body}</div>}
      {content.audio && <Voice path={content.audio} peaks={content.peaks} label="the voice note" />}
      {content.cards && content.cards.length > 0 && (
        <div className="cards">
          {content.cards.map((c, i) => (
            <span key={i} className="mini-card" style={{ rotate: `${(i % 2 ? 1.5 : -2) + i * 0.4}deg` }}>
              {c}
            </span>
          ))}
        </div>
      )}
      {content.tabs && content.tabs.length > 0 && (
        <div className="take">
          <p className="take-head">
            Take what you <em>need</em>
          </p>
          <div className="tabs-row">
            {content.tabs.map((tab, i) =>
              torn.includes(i) ? (
                <span key={i} className="tab gone" aria-label={`${tab.label}, taken`} />
              ) : (
                <button
                  key={i}
                  className={`tab ${tearing === i ? "tearing" : ""}`}
                  disabled={!onTear || tearing !== null}
                  onClick={async () => {
                    if (!onTear) return;
                    setErr(null);
                    setTearing(i);
                    try {
                      await new Promise((r) => setTimeout(r, 550));
                      await onTear(i);
                    } catch (e) {
                      setErr((e as Error).message);
                    } finally {
                      setTearing(null);
                    }
                  }}
                >
                  <span>{tab.label}</span>
                </button>
              ),
            )}
          </div>
          {onTear && torn.length < content.tabs.length && <small className="take-hint">Tap one to tear it off. Each one only once.</small>}
          {err && <p className="err">{err}</p>}
          {torn.length > 0 && (
            <div className="taken">
              {torn.map((i) => (
                <div key={i} className="taken-note">
                  <b>{content.tabs![i]?.label}</b>
                  <p>{content.tabs![i]?.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="letter-sign">
        — {from}
        <small>Sealed {sealedOn}</small>
      </p>
    </div>
  );
}

function LetterView({ env, content, from, onClose, onTear }: { env: Envelope; content: LetterContent; from: string; onClose: () => void; onTear: (i: number) => Promise<void> }) {
  return (
    <div className="letter-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <article className="letter" role="dialog" aria-modal="true" aria-label={env.title}>
        <LetterBody content={content} title={env.title} from={from} sealedOn={prettyDate(dayKey(env.created_at))} onTear={onTear} />
        <button className="btn wide fold" onClick={onClose}>
          Fold it away
        </button>
      </article>
    </div>
  );
}

/* ---------------- Writing ---------------- */
function Write({ existing, onClose }: { existing: { id: string; env: Envelope; content: LetterContent } | null; onClose: () => void }) {
  const { me, them, reload, remove } = useChez();
  const c = existing?.content;
  const [seal, setSeal] = useState<Seal>(existing?.env.seal ?? "when");
  const [title, setTitle] = useState(existing?.env.title ?? "");
  const [openOn, setOpenOn] = useState(existing?.env.open_on ?? "");
  const [body, setBody] = useState(c?.body ?? "");
  const [frontMode, setFrontMode] = useState<"style" | "photo">(existing?.env.envelope_photo ? "photo" : "style");
  const [style, setStyle] = useState<EnvelopeStyle | null>(existing?.env.envelope?.style ?? null);
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null);
  const [paper, setPaper] = useState<Paper>(c?.paper ?? "cream");
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(c?.tabs ?? []);
  const [cards, setCards] = useState<string[]>(c?.cards ?? []);
  const { busy, error, run } = useAction();
  const locked = !!existing?.env.opened_at;
  const today = dayKey();
  const shownStyle = style ?? styleFor(title, seal);
  const hasFront = frontMode === "style" || frontPhoto || existing?.env.envelope_photo;
  const ok =
    title.trim() &&
    hasFront &&
    (body.trim() || photo || voice || c?.image || c?.audio || cards.some((x) => x.trim()) || tabs.some((x) => x.note.trim())) &&
    (seal !== "date" || openOn >= today);

  if (locked)
    return (
      <Sheet title={existing!.env.title} onClose={onClose} tone="quiet">
        <p className="muted small">{them} has opened this one, so it's theirs now. Here's what you wrote.</p>
        <LetterBody content={c!} title={existing!.env.title} from={me.name} sealedOn={prettyDate(dayKey(existing!.env.created_at))} />
      </Sheet>
    );

  return (
    <Sheet title={existing ? "Your letter" : `A letter for ${them}`} onClose={onClose} tone="quiet">
      <div className="field">
        <span>When can it be opened?</span>
        <div className="seg-btns">
          {SEALS.map((s) => (
            <button key={s.key} className={seal === s.key ? "on" : ""} onClick={() => setSeal(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        {seal === "meeting" && <small className="muted">{OCCASION.meeting.how}</small>}
        {seal === "wedding" && <small className="muted">{OCCASION.wedding.how}</small>}
        {seal === "when" && <small className="muted">{them} decides when the moment has come. You'll know when it's opened.</small>}
        {seal === "now" && <small className="muted">Ready the moment it arrives. Good for the very first one: what the Vault is.</small>}
      </div>
      {seal === "date" && (
        <label className="field">
          <span>Opens on</span>
          <input type="date" value={openOn} min={today} onChange={(e) => setOpenOn(e.target.value)} />
        </label>
      )}
      <div className="chips">
        {SEALS.find((s) => s.key === seal)!.titles.map((x) => (
          <button key={x} className="chip" onClick={() => setTitle(x)}>
            {x}
          </button>
        ))}
      </div>
      <label className="field">
        <span>On the envelope</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} placeholder="Open when you miss me" />
        <small className="muted">{them} can see the envelope before it opens. Everything inside stays sealed.</small>
      </label>

      <div className="field">
        <span>The envelope front</span>
        <div className="seg-btns">
          <button className={frontMode === "photo" ? "on" : ""} onClick={() => setFrontMode("photo")}>
            My own drawing
          </button>
          <button className={frontMode === "style" ? "on" : ""} onClick={() => setFrontMode("style")}>
            Pick a style
          </button>
        </div>
        {frontMode === "photo" ? (
          <>
            <label className="front-drop">
              {frontPhoto ? (
                <span className="front photo">
                  <img className="front-photo" src={URL.createObjectURL(frontPhoto)} alt="" />
                </span>
              ) : existing?.env.envelope_photo ? (
                <EnvelopeFront title={title} style={shownStyle} photo={existing.env.envelope_photo} />
              ) : (
                <span className="front-empty">
                  <Icon name="photo" size={26} />
                  Photo of your hand-drawn front
                </span>
              )}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setFrontPhoto(e.target.files[0])} />
            </label>
            <small className="muted">Hand-letter it on paper or card, lay it flat in daylight, and take the photo straight on, filling the frame. Landscape works best.</small>
          </>
        ) : (
          <div className="style-pick">
            {STYLES.map((s) => (
              <button key={s} className={shownStyle === s ? "on" : ""} onClick={() => setStyle(s)} aria-label={`${s} style`}>
                <EnvelopeFront title={title || "Open when you miss me"} style={s} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <span>The paper</span>
        <div className="seg-btns">
          {PAPERS.map((p) => (
            <button key={p.key} className={paper === p.key ? "on" : ""} onClick={() => setPaper(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>The letter</span>
        <textarea className={`letter-write w-${paper}`} rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Dear ${them},`} />
      </label>
      <label className={`photo-drop small ${photo || c?.image ? "has" : ""}`}>
        {photo ? <img src={URL.createObjectURL(photo)} alt="" /> : c?.image ? <StoredImage path={c.image} /> : <><Icon name="photo" size={22} /><span>Tape in a photo (optional)</span></>}
        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
      </label>
      <div className="field">
        <span>A voice note (optional)</span>
        {c?.audio && !voice && <Voice path={c.audio} peaks={c.peaks} />}
        <VoiceMaker onDone={setVoice} hint="Record one, or upload a screen recording of a voice note. Only the sound is kept." />
      </div>

      <details className="extras" open={tabs.length > 0 || cards.length > 0}>
        <summary>Extras inside the envelope</summary>
        <div className="field">
          <span>Take what you need (tear-off tabs)</span>
          <small className="muted">Each tab hides a little note. {them} tears one off when they need it, and each only once.</small>
          {tabs.map((tab, i) => (
            <div key={i} className="tab-edit">
              <input value={tab.label} maxLength={20} placeholder="Strength" onChange={(e) => setTabs((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
              <textarea rows={2} value={tab.note} maxLength={280} placeholder="The note behind it" onChange={(e) => setTabs((x) => x.map((y, j) => (j === i ? { ...y, note: e.target.value } : y)))} />
              <button className="icon-btn" aria-label="Remove tab" onClick={() => setTabs((x) => x.filter((_, j) => j !== i))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {tabs.length < 8 && (
            <div className="chips">
              {TAB_IDEAS.filter((x) => !tabs.some((t) => t.label === x)).map((x) => (
                <button key={x} className="chip" onClick={() => setTabs((t) => [...t, { label: x, note: "" }])}>
                  + {x}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <span>Little cards</span>
          {cards.map((card, i) => (
            <div key={i} className="tab-edit">
              <input value={card} maxLength={80} placeholder="A bad day only lasts 24 hours" onChange={(e) => setCards((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
              <button className="icon-btn" aria-label="Remove card" onClick={() => setCards((x) => x.filter((_, j) => j !== i))}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {cards.length < 4 && (
            <button className="btn small" onClick={() => setCards((x) => [...x, ""])}>
              Add a card
            </button>
          )}
        </div>
      </details>

      {error && <p className="err">{error}</p>}
      {seal === "date" && openOn && openOn < today && <p className="err">Pick today or a day to come.</p>}
      <button
        className="btn primary wide"
        disabled={!ok || busy}
        onClick={() =>
          run(async () => {
            const image = photo ? await store.upload(await shrinkPhoto(photo), "jpg") : c?.image ?? null;
            const envelopePhoto = frontMode === "photo" ? (frontPhoto ? await store.upload(await shrinkPhoto(frontPhoto, 1400), "jpg") : existing?.env.envelope_photo ?? null) : null;
            const keepTabs = tabs.filter((x) => x.label.trim() && x.note.trim()).map((x) => ({ label: x.label.trim(), note: x.note.trim() }));
            const keepCards = cards.map((x) => x.trim()).filter(Boolean);
            const letter = {
              title: title.trim(),
              seal,
              open_on: seal === "date" ? openOn : null,
              body: body.trim() || null,
              image,
              audio: voice?.path ?? c?.audio ?? null,
              peaks: voice?.peaks ?? c?.peaks ?? null,
              envelope: frontMode === "style" ? { style: shownStyle } : null,
              envelope_photo: envelopePhoto,
              paper,
              tabs: keepTabs.length ? keepTabs : null,
              cards: keepCards.length ? keepCards : null,
            };
            if (existing) await store.editLetter(existing.id, letter);
            else {
              await store.writeLetter(letter);
              void store.notify("The Vault", `${me.name} sealed a letter for you: “${letter.title}”`, "vault");
            }
            await reload();
            onClose();
          })
        }
      >
        <Icon name="seal" size={18} /> {busy ? "Sealing…" : existing ? "Reseal it" : "Seal it"}
      </button>
      {existing && (
        <button
          className="link danger"
          onClick={() =>
            confirm("Tear this letter up? It can't be undone.") &&
            run(async () => {
              await remove("vault_letters", existing.id);
              onClose();
            })
          }
        >
          Tear it up
        </button>
      )}
    </Sheet>
  );
}
