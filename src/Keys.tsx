import { useState } from "react";
import { LOGIN, store } from "./store";
import { Icon, useAction } from "./ui";
import type { Member } from "./types";

/** The reveal: the link you text her. An official notice, then the keys to her place. */
export function Keys({ onIn }: { onIn: (m: Member) => void }) {
  const [step, setStep] = useState<"notice" | "keys" | "welcome">("notice");
  const [key, setKey] = useState("");
  const [mine, setMine] = useState("");
  const [me, setMe] = useState<Member | null>(null);
  const { busy, error, run, setError } = useAction();

  if (step === "notice")
    return (
      <div className="reveal">
        <div className="envelope">
          <small className="kicker">Official notice</small>
          <h1>A property has been registered in your name.</h1>
          <p className="muted">Please collect your keys in person. Well, on your phone. Close enough.</p>
          <button className="btn primary wide" onClick={() => setStep("keys")}>
            <Icon name="seal" size={18} /> Break the seal
          </button>
        </div>
      </div>
    );

  if (step === "welcome" && me)
    return (
      <div className="reveal open">
        <div className="doors">
          <p className="kicker">Welcome home</p>
          <h1 className="wordmark big">Chez Bébé</h1>
          <p>
            Owner: <b>{me.name}</b>
          </p>
          <p className="muted small">Built by Abdulmalik. He's the guest. On probation.</p>
          <button className="btn primary wide" onClick={() => onIn(me)}>
            Walk in
          </button>
        </div>
      </div>
    );

  return (
    <div className="reveal">
      <form
        className="envelope"
        onSubmit={(e) => {
          e.preventDefault();
          if (mine && mine.length < 8) return setError("Make your own key at least 8 characters.");
          void run(async () => {
            await store.acceptKeys(LOGIN.her, key.trim(), mine);
            const m = await store.me();
            if (!m) throw new Error("This house only has two keys, and this isn't one of them.");
            setMe(m);
            setStep("welcome");
          });
        }}
      >
        <h1 className="wordmark">Chez Bébé</h1>
        <p className="muted">Please accept your keys.</p>
        {/* lets her phone remember the key she chooses */}
        <input type="text" autoComplete="username" value={LOGIN.her} readOnly hidden />
        <label className="field">
          <span>The key from your message</span>
          <input type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} required />
        </label>
        <label className="field">
          <span>Now choose your own key</span>
          <input type="password" autoComplete="new-password" value={mine} onChange={(e) => setMine(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
          <small className="muted">So only you can get in. Nobody else will know it, not even him.</small>
        </label>
        {error && <p className="err">{error}</p>}
        <button className="btn primary wide" disabled={busy}>
          <Icon name="key" size={18} /> {busy ? "Turning the key…" : "Accept the keys"}
        </button>
      </form>
    </div>
  );
}

export function SignIn({ onIn, vault }: { onIn: (m: Member) => void; vault?: boolean }) {
  const [who, setWho] = useState<"her" | "him" | null>(null);
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  return (
    <div className={`reveal ${vault ? "vault-door-in" : ""}`}>
      <form
        className="envelope"
        onSubmit={(e) => {
          e.preventDefault();
          if (!who) return;
          void run(async () => {
            await store.signIn(LOGIN[who], password);
            const m = await store.me();
            if (m) onIn(m);
          });
        }}
      >
        <h1 className="wordmark">{vault ? "The Vault" : "Chez Bébé"}</h1>
        <p className="muted">{vault ? "Letters for later. The same key as Chez Bébé." : "Private residence. Two keys only."}</p>
        <div className="seg-btns">
          <button type="button" className={who === "her" ? "on" : ""} onClick={() => setWho("her")}>
            The owner
          </button>
          <button type="button" className={who === "him" ? "on" : ""} onClick={() => setWho("him")}>
            The guest
          </button>
        </div>
        <input type="text" autoComplete="username" value={who ? LOGIN[who] : ""} readOnly hidden />
        <label className="field">
          <span>Your key</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="err">{error}</p>}
        <button className="btn primary wide" disabled={busy || !who}>
          {busy ? "Opening…" : "Let me in"}
        </button>
        {!vault && (
          <a className="link" href="#/keys">
            First time here? Accept your keys
          </a>
        )}
      </form>
    </div>
  );
}
