import { useEffect, useState } from "react";
import { useChez } from "./data";
import { markBoardSeen } from "./Home";
import { crowns, goalProgress } from "./logic";
import { store } from "./store";
import { Icon, Sheet, shrinkPhoto, StoredImage, useAction } from "./ui";
import type { Goal, Pin, Who } from "./types";

const KINDS: { key: Pin["kind"]; label: string }[] = [
  { key: "castle", label: "Castles" },
  { key: "house", label: "Houses" },
  { key: "place", label: "Places" },
  { key: "dream", label: "Dreams" },
];

export default function Board() {
  const { me, partner, t, now, members } = useChez();
  const [kind, setKind] = useState<Pin["kind"] | "all">("all");
  const [adding, setAdding] = useState(false);
  const [goalFor, setGoalFor] = useState<Pin | "new" | null>(null);
  const [open, setOpen] = useState<Pin | null>(null);
  useEffect(() => markBoardSeen(me.user_id), [me.user_id, t.pins.length]);

  const earned = crowns(t, members, now);
  const progress = goalProgress(t.goals, members, earned);
  const pins = t.pins.filter((p) => kind === "all" || p.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="page board">
      <header className="page-head">
        <p className="kicker">The Board</p>
        <h1>Castles &amp; Someday</h1>
        <p className="muted">Everything you're dreaming about. Pin anything; make the best ones goals and earn crowns towards them.</p>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>Goals</h2>
          <button className="btn small" onClick={() => setGoalFor("new")}>
            New goal
          </button>
        </div>
        {t.goals.length === 0 && <p className="empty">No goals yet. A castle, perhaps.</p>}
        {[...t.goals]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((g) => {
            const p = progress.get(g.id);
            const pin = t.pins.find((x) => x.id === g.pin_id);
            const forName = members.find((m) => m.who === g.for_who)?.name ?? g.for_who;
            return (
              <div className={`goal ${p?.achieved ? "won" : ""}`} key={g.id}>
                {pin?.image && <StoredImage path={pin.image} className="goal-img" />}
                <div className="goal-body">
                  <div className="goal-top">
                    <b>{g.title}</b>
                    <small>{p?.achieved ? "Achieved" : `${(p?.saved ?? 0).toLocaleString()} / ${g.target.toLocaleString()}`}</small>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${((p?.saved ?? 0) / g.target) * 100}%` }} />
                  </div>
                  <small className="muted">
                    For {g.for_who === me.who ? "you" : forName} · {p?.earner?.user_id === me.user_id ? "you earn it" : `${p?.earner?.name ?? "they"} earn${p?.earner ? "s" : ""} it`}
                  </small>
                </div>
              </div>
            );
          })}
        <p className="small muted crowns-how">
          <Icon name="crown" size={14} /> Crowns: good morning 10 · check-in 5 · decree carried out 10 · duel won 20 · case won 15 · memory added 3
        </p>
      </section>

      <div className="board-bar">
        <nav className="filter">
          <button className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>
            All
          </button>
          {KINDS.map((k) => (
            <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </nav>
        <button className="btn primary small" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Pin
        </button>
      </div>

      {pins.length === 0 && <p className="empty">Nothing pinned here yet.</p>}
      <div className="pins">
        {pins.map((p) => (
          <button key={p.id} className="pin" onClick={() => setOpen(p)}>
            {p.image ? <StoredImage path={p.image} className="pin-img" alt={p.title} /> : <span className={`pin-img blank ${p.kind}`}><Icon name={p.kind === "castle" ? "board" : p.kind === "house" ? "home" : "us"} size={30} /></span>}
            <span className="pin-text">
              <b>{p.title}</b>
              {p.place && <small>{p.place}</small>}
              <small className="by">{p.by === me.user_id ? "Pinned by you" : `Pinned by ${partner?.name ?? "them"}`}</small>
            </span>
          </button>
        ))}
      </div>

      {adding && <AddPin onClose={() => setAdding(false)} />}
      {open && <PinSheet pin={open} onClose={() => setOpen(null)} onGoal={() => (setGoalFor(open), setOpen(null))} />}
      {goalFor && <NewGoal pin={goalFor === "new" ? null : goalFor} onClose={() => setGoalFor(null)} />}
    </div>
  );
}

function AddPin({ onClose }: { onClose: () => void }) {
  const { me, add } = useChez();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<Pin["kind"]>("castle");
  const { busy, error, run } = useAction();
  return (
    <Sheet title="Pin something" onClose={onClose}>
      <label className={`photo-drop ${preview ? "has" : ""}`}>
        {preview ? <img src={preview} alt="" /> : <><Icon name="photo" size={28} /><span>Add a photo or a screenshot of the reel</span></>}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPhoto(f);
            setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
      <div className="seg-btns">
        {KINDS.map((k) => (
          <button key={k.key} className={kind === k.key ? "on" : ""} onClick={() => setKind(k.key)}>
            {k.label.slice(0, -1)}
          </button>
        ))}
      </div>
      <label className="field">
        <span>What is it?</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Château de Chambord" maxLength={80} />
      </label>
      <label className="field">
        <span>Where?</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Loire Valley, France" maxLength={80} />
      </label>
      <label className="field">
        <span>Link to the reel (optional)</span>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url" />
      </label>
      <label className="field">
        <span>A note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="This one. Obviously." maxLength={140} />
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!title.trim() || busy}
        onClick={() =>
          run(async () => {
            const image = photo ? await store.upload(await shrinkPhoto(photo), "jpg") : null;
            const url = link.trim();
            await add("pins", { title: title.trim(), place: place.trim() || null, link: /^https?:\/\//.test(url) ? url : null, note: note.trim() || null, kind, image }, [
              "The Board",
              `${me.name} pinned ${title.trim()}${place.trim() ? `, ${place.trim()}` : ""}`,
            ]);
            onClose();
          })
        }
      >
        {busy ? "Pinning…" : "Pin it"}
      </button>
    </Sheet>
  );
}

function PinSheet({ pin, onClose, onGoal }: { pin: Pin; onClose: () => void; onGoal: () => void }) {
  const { me, t, remove } = useChez();
  const isGoal = t.goals.some((g) => g.pin_id === pin.id);
  const { busy, error, run } = useAction();
  return (
    <Sheet title={pin.title} onClose={onClose}>
      {pin.image && <StoredImage path={pin.image} className="pin-full" alt={pin.title} />}
      {pin.place && <p className="muted">{pin.place}</p>}
      {pin.note && <p className="pin-note">“{pin.note}”</p>}
      <div className="row">
        {pin.link && (
          <a className="btn" href={pin.link} target="_blank" rel="noreferrer">
            <Icon name="link" size={16} /> Open the reel
          </a>
        )}
        {!isGoal && (
          <button className="btn primary" onClick={onGoal}>
            <Icon name="crown" size={16} /> Make it a goal
          </button>
        )}
      </div>
      {pin.by === me.user_id && (
        <button
          className="link danger"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await remove("pins", pin.id);
              onClose();
            })
          }
        >
          Remove this pin
        </button>
      )}
      {error && <p className="err">{error}</p>}
    </Sheet>
  );
}

function NewGoal({ pin, onClose }: { pin: Pin | null; onClose: () => void }) {
  const { me, members, add } = useChez();
  const [title, setTitle] = useState(pin?.title ?? "");
  const [forWho, setForWho] = useState<Who>(pin?.kind === "castle" ? "her" : me.who === "her" ? "him" : "her");
  const [target, setTarget] = useState(2500);
  const { busy, error, run } = useAction();
  const name = (w: Who) => (w === me.who ? "You" : members.find((m) => m.who === w)?.name ?? w);
  return (
    <Sheet title="New goal" onClose={onClose}>
      <label className="field">
        <span>Saving up for</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="GTA 6" maxLength={60} />
      </label>
      <div className="field">
        <span>Who is it for? (the other one earns it)</span>
        <div className="seg-btns">
          {(["her", "him"] as Who[]).map((w) => (
            <button key={w} className={forWho === w ? "on" : ""} onClick={() => setForWho(w)}>
              {name(w)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>How many crowns?</span>
        <div className="seg-btns">
          {[500, 1500, 2500, 5000, 10000].map((n) => (
            <button key={n} className={target === n ? "on" : ""} onClick={() => setTarget(n)}>
              {n.toLocaleString()}
            </button>
          ))}
        </div>
        <small className="muted">About {Math.round(target / 25)} days of good mornings and check-ins.</small>
      </div>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!title.trim() || busy}
        onClick={() =>
          run(async () => {
            await add("goals", { title: title.trim(), for_who: forWho, target, pin_id: pin?.id ?? null } as Partial<Goal>);
            onClose();
          })
        }
      >
        {busy ? "Saving…" : "Start saving"}
      </button>
    </Sheet>
  );
}
