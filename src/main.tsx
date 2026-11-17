import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
import Board from "./Board";
import Court from "./Court";
import { ChezProvider, useChez } from "./data";
import Home from "./Home";
import { Keys, SignIn } from "./Keys";
import Play from "./Play";
import { demoReset, demoSwitch, store } from "./store";
import { Icon, Sheet, useAction } from "./ui";
import type { Member } from "./types";
import Us from "./Us";

// #/                home          #/court, #/court/decrees
// #/play            daily duel    #/board
// #/us, #/us/timeline             #/keys  (her first visit)
// The Vault is a separate app: vault.html
const route = () => location.hash.replace(/^#\/?/, "").split("/");

function App() {
  const [me, setMe] = useState<Member | null | undefined>(undefined);
  const [r, setR] = useState(route);
  useEffect(() => {
    store.me().then(setMe).catch(() => setMe(null));
    const on = () => {
      setR(route());
      scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  if (me === undefined) return <div className="loading wordmark">Chez Bébé</div>;
  if (r[0] === "keys" && (store.demo || !me?.accepted_at))
    return (
      <Keys
        onIn={(m) => {
          setMe(m);
          location.hash = "#/";
        }}
      />
    );
  if (!me) return <SignIn onIn={setMe} />;
  return (
    <ChezProvider me={me}>
      <Shell r={r} onSignOut={() => setMe(null)} />
    </ChezProvider>
  );
}

const TABS = [
  { href: "#/", key: "", icon: "home", label: "Home" },
  { href: "#/court", key: "court", icon: "gavel", label: "Court" },
  { href: "#/play", key: "play", icon: "play", label: "Duel" },
  { href: "#/board", key: "board", icon: "board", label: "Board" },
  { href: "#/us", key: "us", icon: "us", label: "Us" },
];

function Shell({ r, onSignOut }: { r: string[]; onSignOut: () => void }) {
  const { me, partner, t } = useChez();
  const [settings, setSettings] = useState(false);
  const page = r[0] ?? "";
  // A dot on Court when something there is waiting for you
  const courtWaiting =
    t.decrees.some((d) => d.by !== me.user_id && !d.done_at) ||
    t.cases.some((c) => !c.verdict && ((c.by !== me.user_id && !c.defence) || (c.by === me.user_id && c.defence)));
  return (
    <div className={`app who-${me.who}`}>
      {store.demo && (
        <div className="demo-bar">
          Demo: you're {me.who === "him" ? "him" : "her"}. <button onClick={demoSwitch}>Switch to {me.who === "him" ? "her" : "his"} side</button>
        </div>
      )}
      <header className="top">
        <a href="#/" className="wordmark">
          Chez Bébé
        </a>
        <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </header>
      <main>
        {page === "court" ? (
          <Court tab={r[1] === "decrees" ? "decrees" : "cases"} />
        ) : page === "play" ? (
          <Play />
        ) : page === "board" ? (
          <Board />
        ) : page === "us" ? (
          <Us tab={r[1] === "timeline" ? "timeline" : "lore"} />
        ) : (
          <Home />
        )}
      </main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <a key={tab.key} href={tab.href} className={page === tab.key || (tab.key === "" && !TABS.some((x) => x.key && x.key === page)) ? "on" : ""}>
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
            {tab.key === "court" && courtWaiting && <i className="dot" aria-label="Something's waiting" />}
          </a>
        ))}
      </nav>
      {settings && <Settings onClose={() => setSettings(false)} onSignOut={onSignOut} partnerName={partner?.name ?? "them"} />}
    </div>
  );
}

function Settings({ onClose, onSignOut, partnerName }: { onClose: () => void; onSignOut: () => void; partnerName: string }) {
  const { me, t, remove } = useChez();
  const [push, setPush] = useState<string | null>(null);
  const { busy, run } = useAction();
  const notes = t.saved_notes.filter((n) => n.by === me.user_id);
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches;
  return (
    <Sheet title="Settings" onClose={onClose}>
      <section className="set">
        <h3>Notifications</h3>
        <p className="muted small">So decrees, cases and good mornings from {partnerName} reach you even when the app is closed.</p>
        {ios && !installed && <p className="small">On iPhone, first add Chez Bébé to your Home Screen: tap Share, then “Add to Home Screen”. Open it from there and come back here.</p>}
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await store.enablePush();
              setPush(
                r === "on"
                  ? "Notifications are on for this phone."
                  : r === "denied"
                    ? "Notifications were blocked. Allow them for Chez Bébé in your phone's Settings."
                    : r === "unsupported"
                      ? "This browser can't do notifications. Add the app to your Home Screen first."
                      : "Notifications aren't set up yet (see SETUP.md, step 6).",
              );
            })
          }
        >
          Turn on notifications
        </button>
        {push && <p className="small">{push}</p>}
      </section>
      <section className="set">
        <h3>Your saved notes</h3>
        <p className="muted small">One-tap messages for busy days, in your own words. Add them when you check in.</p>
        {notes.length === 0 && <p className="small muted">None yet.</p>}
        {notes.map((n) => (
          <div className="saved-note" key={n.id}>
            <p>{n.text}</p>
            <button className="icon-btn" aria-label="Remove note" onClick={() => remove("saved_notes", n.id)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </section>
      <section className="set">
        <h3>Keep a copy</h3>
        <p className="muted small">Downloads everything written in Chez Bébé as one file. Photos and voice notes stay in storage; the file lists them.</p>
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...t }, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `chez-bebe-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}
        >
          Download a copy
        </button>
      </section>
      <section className="set">
        {store.demo ? (
          <>
            <button className="btn" onClick={demoSwitch}>
              Switch to {me.who === "him" ? "her" : "his"} side
            </button>{" "}
            <button className="link danger" onClick={() => confirm("Start the demo again from scratch?") && demoReset()}>
              Reset the demo
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={async () => {
              await store.signOut();
              onSignOut();
            }}
          >
            Sign out
          </button>
        )}
      </section>
    </Sheet>
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
