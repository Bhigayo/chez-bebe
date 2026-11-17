import { useState } from "react";
import { useChez } from "./data";
import { dayKey, keysTurned, letterReady } from "./logic";
import { store } from "./store";
import { Icon, prettyDate, Sheet, shrinkPhoto, StoredImage, useAction, Voice, VoiceMaker, when, type VoiceResult } from "./ui";
import type { Envelope, LetterContent, Occasion, Seal } from "./types";

const SEALS: { key: Seal; label: string; titles: string[] }[] = [
  { key: "date", label: "On a date", titles: ["For your birthday", "For our first month", "For your graduation"] },
  { key: "when", label: "Open when…", titles: ["Open when you miss me", "Open when you've had a bad day", "Open when you can't sleep", "Open when you need a laugh"] },
  { key: "meeting", label: "When we meet", titles: ["For the first time in the same room"] },
  { key: "wedding", label: "Wedding day", titles: ["For our wedding day"] },
];
const OCCASION: Record<Occasion, { name: string; how: string }> = {
  meeting: { name: "The first time in the same room", how: "When you're finally together, you both turn your keys, and those letters open." },
  wedding: { name: "The wedding day", how: "On the day, you both turn your keys, and those letters open. Neither of you can open them alone." },
};

const lowerFirst = (x: string) => x[0].toLowerCase() + x.slice(1);

export const sealLine = (e: Pick<Envelope, "seal" | "open_on">, ready: boolean) =>
  e.seal === "when"
    ? "Whenever the moment comes"
    : ready
      ? "Ready to open"
      : e.seal === "date"
        ? `Opens ${prettyDate(e.open_on!, { day: "numeric", month: "long", year: "numeric" })}`
        : e.seal === "meeting"
          ? "Opens when you're in the same room"
          : "Opens on your wedding day";

export default function Vault() {
  const { me, partner, t, now, them } = useChez();
  const [writing, setWriting] = useState<{ id: string; content: LetterContent; env: Envelope } | "new" | null>(null);
  const [reading, setReading] = useState<{ env: Envelope; content: LetterContent } | null>(null);
  const [asking, setAsking] = useState<Envelope | null>(null);
  const [cracking, setCracking] = useState<string | null>(null);
  const { error, run } = useAction();

  const forMe = t.vault_letters.filter((e) => e.by !== me.user_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
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
          {ready.map((e) => (
            <EnvelopeCard key={e.id} env={e} ready from={them} cracking={cracking === e.id} onOpen={() => (e.seal === "when" ? setAsking(e) : open(e))} />
          ))}
        </section>
      )}

      {occasions.map((o) => (
        <Keys key={o} occasion={o} />
      ))}

      <section>
        <h2 className="vault-h">Sealed for you</h2>
        {sealed.length === 0 && <p className="vault-empty">{forMe.length ? "Nothing still sealed. For now." : `Nothing from ${them} yet.`}</p>}
        {sealed.map((e) => (
          <EnvelopeCard key={e.id} env={e} from={them} />
        ))}
      </section>

      {opened.length > 0 && (
        <section>
          <h2 className="vault-h">Opened</h2>
          {opened.map((e) => (
            <EnvelopeCard key={e.id} env={e} ready from={them} onOpen={() => open(e)} note={`Opened ${when(e.opened_at!, now)}`} />
          ))}
        </section>
      )}

      <section>
        <h2 className="vault-h">Your letters to {them}</h2>
        {fromMe.length === 0 && <p className="vault-empty">You haven't sealed any yet.</p>}
        {fromMe.map((e) => (
          <EnvelopeCard
            key={e.id}
            env={e}
            mine
            ready={letterReady(e, t.vault_unlocks, now)}
            onOpen={() => open(e)}
            note={e.opened_at ? `${them} opened it ${when(e.opened_at, now)}` : `Still sealed · ${lowerFirst(sealLine(e, false))}`}
          />
        ))}
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
      {reading && <LetterView env={reading.env} content={reading.content} from={partner?.name ?? them} onClose={() => setReading(null)} />}
      {writing && <Write existing={writing === "new" ? null : writing} onClose={() => setWriting(null)} />}
    </div>
  );
}

function EnvelopeCard({ env, ready, from, mine, onOpen, note, cracking }: { env: Envelope; ready?: boolean; from?: string; mine?: boolean; onOpen?: () => void; note?: string; cracking?: boolean }) {
  const body = (
    <>
      <span className={`wax ${cracking ? "crack" : ""}`} aria-hidden="true">
        <i>B</i>
      </span>
      <span className="env-text">
        <small>{mine ? "From you" : `From ${from}`}</small>
        <b>{env.title}</b>
        <em>{note ?? sealLine(env, !!ready)}</em>
      </span>
      {!mine && !ready && <Icon name="key" size={18} />}
    </>
  );
  return onOpen ? (
    <button className={`env ${ready && !env.opened_at && !mine ? "ready" : ""} ${env.opened_at ? "opened" : ""}`} onClick={onOpen} disabled={cracking}>
      {body}
    </button>
  ) : (
    <div className="env sealed">{body}</div>
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

function LetterView({ env, content, from, onClose }: { env: Envelope; content: LetterContent; from: string; onClose: () => void }) {
  return (
    <div className="letter-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <article className="letter" role="dialog" aria-modal="true" aria-label={env.title}>
        <small className="kicker">{env.title}</small>
        {content.image && <StoredImage path={content.image} className="letter-img" />}
        {content.body && <div className="letter-body">{content.body}</div>}
        {content.audio && <Voice path={content.audio} peaks={content.peaks} label="the voice note" />}
        <p className="letter-sign">
          — {from}
          <small>Sealed {prettyDate(dayKey(env.created_at))}</small>
        </p>
        <button className="btn wide" onClick={onClose}>
          Fold it away
        </button>
      </article>
    </div>
  );
}

function Write({ existing, onClose }: { existing: { id: string; env: Envelope; content: LetterContent } | null; onClose: () => void }) {
  const { me, them, reload, remove } = useChez();
  const [seal, setSeal] = useState<Seal>(existing?.env.seal ?? "date");
  const [title, setTitle] = useState(existing?.env.title ?? "");
  const [openOn, setOpenOn] = useState(existing?.env.open_on ?? "");
  const [body, setBody] = useState(existing?.content.body ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [voice, setVoice] = useState<VoiceResult | null>(null);
  const { busy, error, run } = useAction();
  const locked = !!existing?.env.opened_at;
  const today = dayKey();
  const ok = title.trim() && (body.trim() || photo || voice || existing?.content.image || existing?.content.audio) && (seal !== "date" || openOn >= today);

  if (locked)
    return (
      <Sheet title={existing!.env.title} onClose={onClose} tone="quiet">
        <p className="muted small">{them} has opened this one, so it's theirs now. Here's what you wrote.</p>
        {existing!.content.image && <StoredImage path={existing!.content.image} className="letter-img" />}
        {existing!.content.body && <div className="letter-body">{existing!.content.body}</div>}
        {existing!.content.audio && <Voice path={existing!.content.audio} peaks={existing!.content.peaks} />}
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} placeholder="For your birthday" />
        <small className="muted">{them} can see this before it opens. The rest stays sealed.</small>
      </label>
      <label className="field">
        <span>The letter</span>
        <textarea className="letter-write" rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Dear ${them},`} />
      </label>
      <label className={`photo-drop small ${photo || existing?.content.image ? "has" : ""}`}>
        {photo ? <img src={URL.createObjectURL(photo)} alt="" /> : existing?.content.image ? <StoredImage path={existing.content.image} /> : <><Icon name="photo" size={22} /><span>Add a photo (optional)</span></>}
        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
      </label>
      <div className="field">
        <span>A voice note (optional)</span>
        {existing?.content.audio && !voice && <Voice path={existing.content.audio} peaks={existing.content.peaks} />}
        <VoiceMaker onDone={setVoice} hint="Record one, or upload a screen recording of a voice note. Only the sound is kept." />
      </div>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!ok || busy}
        onClick={() =>
          run(async () => {
            const image = photo ? await store.upload(await shrinkPhoto(photo), "jpg") : existing?.content.image ?? null;
            const letter = {
              title: title.trim(),
              seal,
              open_on: seal === "date" ? openOn : null,
              body: body.trim() || null,
              image,
              audio: voice?.path ?? existing?.content.audio ?? null,
              peaks: voice?.peaks ?? existing?.content.peaks ?? null,
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
      {seal === "date" && openOn && openOn < today && <p className="err">Pick today or a day to come.</p>}
    </Sheet>
  );
}
