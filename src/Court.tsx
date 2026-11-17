import { useState } from "react";
import { useChez } from "./data";
import { courtRecord, isQuiet } from "./logic";
import { Icon, Sheet, useAction, when } from "./ui";
import type { Case } from "./types";

const CHARGES = ["My gut says so", "Seen online, didn't reply", "Suspected of future wrongdoing", "Unauthorised attitude", "Crimes against the voice notes"];
const DECREES = ["A good morning before 9am", "One voice note before bed", "A photo of what you're eating", "Admit I was right"];

export default function Court({ tab }: { tab: "cases" | "decrees" }) {
  const { me, partner, t, now, them } = useChez();
  const record = courtRecord(t.cases, [me, ...(partner ? [partner] : [])]);
  const quiet = partner ? isQuiet(t.checkins, partner.user_id, now) : false;
  return (
    <div className="page court">
      <header className="page-head">
        <p className="kicker">The Court of Chez Bébé</p>
        <h1>{tab === "cases" ? "Cases" : "Decrees"}</h1>
        <nav className="seg">
          <a href="#/court" className={tab === "cases" ? "on" : ""}>
            Cases
          </a>
          <a href="#/court/decrees" className={tab === "decrees" ? "on" : ""}>
            Decrees
          </a>
        </nav>
      </header>
      {tab === "cases" && (
        <div className="record">
          <div>
            <b>{record[me.user_id] ?? 0}</b>
            <small>you</small>
          </div>
          <span>cases won</span>
          <div>
            <b>{partner ? record[partner.user_id] ?? 0 : 0}</b>
            <small>{them}</small>
          </div>
        </div>
      )}
      {quiet && <p className="quiet-note">{them} is having a rough day, so the court is closed to new cases and decrees for them until it's better.</p>}
      {tab === "cases" ? <Cases quiet={quiet} /> : <Decrees quiet={quiet} />}
    </div>
  );
}

function Cases({ quiet }: { quiet: boolean }) {
  const { t } = useChez();
  const [filing, setFiling] = useState(false);
  const open = t.cases.filter((c) => !c.verdict).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const closed = t.cases.filter((c) => c.verdict).sort((a, b) => (b.ruled_at ?? "").localeCompare(a.ruled_at ?? ""));
  return (
    <>
      <button className="btn primary wide" disabled={quiet} onClick={() => setFiling(true)}>
        <Icon name="gavel" size={18} /> File a case
      </button>
      {open.length > 0 && <h2 className="section">Open</h2>}
      {open.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}
      {closed.length > 0 && <h2 className="section">Closed</h2>}
      {closed.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}
      {t.cases.length === 0 && <p className="empty">No cases yet. Peace in the house. For now.</p>}
      {filing && <FileCase onClose={() => setFiling(false)} />}
    </>
  );
}

function CaseCard({ c }: { c: Case }) {
  const { me, members, now, edit } = useChez();
  const accuser = members.find((m) => m.user_id === c.by);
  const accused = members.find((m) => m.user_id !== c.by);
  const iAccuse = c.by === me.user_id;
  const [defence, setDefence] = useState("");
  const [sentence, setSentence] = useState("");
  const { busy, error, run } = useAction();
  return (
    <article className={`case ${c.verdict ?? "open"}`}>
      <div className="case-top">
        <small className="kicker">
          {accuser?.name ?? "?"} v. {accused?.name ?? "?"}
        </small>
        <small className="muted">{when(c.created_at, now)}</small>
      </div>
      <h3>{c.title}</h3>
      <p className="charge">{c.charge}</p>
      {c.defence ? (
        <div className="defence">
          <small>The defence</small>
          <p>“{c.defence}”</p>
        </div>
      ) : !iAccuse && !c.verdict ? (
        <div className="field">
          <span>Your defence</span>
          <textarea rows={3} value={defence} onChange={(e) => setDefence(e.target.value)} placeholder="I promise I have not done anything wrong…" />
          <button
            className="btn"
            disabled={!defence.trim() || busy}
            onClick={() => run(() => edit("cases", c.id, { defence: defence.trim(), defended_at: new Date().toISOString() }, ["The Court", `${me.name} has submitted a defence.`]))}
          >
            Submit defence
          </button>
        </div>
      ) : (
        !c.verdict && <p className="muted small">Awaiting the defence.</p>
      )}
      {c.verdict ? (
        <div className={`verdict ${c.verdict}`}>
          <span className="stamp">{c.verdict === "guilty" ? "Guilty" : c.verdict === "pardoned" ? "Pardoned" : "Dismissed"}</span>
          {c.sentence && <p>{c.sentence}</p>}
        </div>
      ) : (
        iAccuse && (
          <div className="rule">
            <span className="small muted">{c.defence ? "Your ruling" : "Rule now, or wait for the defence"}</span>
            <input value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="Sentence (optional)" maxLength={160} />
            <div className="row">
              {(["guilty", "pardoned", "dismissed"] as const).map((v) => (
                <button
                  key={v}
                  className={`btn ${v === "guilty" ? "primary" : ""}`}
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      edit("cases", c.id, { verdict: v, sentence: sentence.trim() || null, ruled_at: new Date().toISOString() }, ["The Court", `Verdict on “${c.title}”: ${v}.`]),
                    )
                  }
                >
                  {v === "guilty" ? "Guilty" : v === "pardoned" ? "Pardon" : "Dismiss"}
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {error && <p className="err">{error}</p>}
    </article>
  );
}

function FileCase({ onClose }: { onClose: () => void }) {
  const { me, them, add } = useChez();
  const [title, setTitle] = useState("");
  const [charge, setCharge] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Sheet title="File a case" onClose={onClose} tone="royal">
      <p className="muted small">Against {them}. They'll write a defence; you give the verdict.</p>
      <div className="chips">
        {CHARGES.map((c) => (
          <button key={c} className="chip" onClick={() => setTitle(c)}>
            {c}
          </button>
        ))}
      </div>
      <label className="field">
        <span>The case</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My gut" maxLength={60} />
      </label>
      <label className="field">
        <span>The charge</span>
        <textarea rows={3} value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="My gut is telling me to be mad at you. Confess." />
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!title.trim() || !charge.trim() || busy}
        onClick={() =>
          run(async () => {
            await add("cases", { title: title.trim(), charge: charge.trim() }, ["The Court", `${me.name} has filed a case against you: ${title.trim()}`]);
            onClose();
          })
        }
      >
        {busy ? "Filing…" : "File it"}
      </button>
    </Sheet>
  );
}

function Decrees({ quiet }: { quiet: boolean }) {
  const { me, t, now, them, edit } = useChez();
  const [issuing, setIssuing] = useState(false);
  const { error, run } = useAction();
  const toMe = t.decrees.filter((d) => d.by !== me.user_id).sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || b.created_at.localeCompare(a.created_at));
  const fromMe = t.decrees.filter((d) => d.by === me.user_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <button className="btn primary wide" disabled={quiet} onClick={() => setIssuing(true)}>
        <Icon name="seal" size={18} /> Issue a decree
      </button>
      {error && <p className="err">{error}</p>}
      <h2 className="section">For you</h2>
      {toMe.length === 0 && <p className="empty">No decrees for you. Suspicious.</p>}
      {toMe.map((d) => (
        <article key={d.id} className={`decree ${d.done_at ? "done" : ""}`}>
          <small className="kicker">By order of {them}</small>
          <p>{d.text}</p>
          <div className="decree-foot">
            <small className="muted">{when(d.created_at, now)}</small>
            {d.done_at ? (
              <span className="done-tag">
                <Icon name="check" size={16} /> Carried out
              </span>
            ) : (
              <button className="btn small primary" onClick={() => run(() => edit("decrees", d.id, { done_at: new Date().toISOString() }, ["Decree carried out", `${me.name}: “${d.text}” ✓`]))}>
                Done
              </button>
            )}
          </div>
        </article>
      ))}
      <h2 className="section">Issued by you</h2>
      {fromMe.length === 0 && <p className="empty">You haven't issued any yet.</p>}
      {fromMe.map((d) => (
        <article key={d.id} className={`decree mine ${d.done_at ? "done" : ""}`}>
          <p>{d.text}</p>
          <small className="muted">{d.done_at ? `Carried out ${when(d.done_at, now)}` : "Not yet carried out"}</small>
        </article>
      ))}
      {issuing && <IssueDecree onClose={() => setIssuing(false)} />}
    </>
  );
}

function IssueDecree({ onClose }: { onClose: () => void }) {
  const { me, add } = useChez();
  const [text, setText] = useState("");
  const { busy, error, run } = useAction();
  return (
    <Sheet title="Issue a decree" onClose={onClose} tone="royal">
      <div className="chips">
        {DECREES.map((d) => (
          <button key={d} className="chip" onClick={() => setText(d)}>
            {d}
          </button>
        ))}
      </div>
      <label className="field">
        <span>By order of {me.name}…</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
      </label>
      {error && <p className="err">{error}</p>}
      <button
        className="btn primary wide"
        disabled={!text.trim() || busy}
        onClick={() =>
          run(async () => {
            await add("decrees", { text: text.trim() }, [`A decree from ${me.name}`, text.trim()]);
            onClose();
          })
        }
      >
        {busy ? "Sealing…" : "Seal and send"}
      </button>
    </Sheet>
  );
}
