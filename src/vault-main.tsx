import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/700.css";
import "@fontsource/permanent-marker/400.css";
import "./styles.css";
import { ChezProvider, useChez } from "./data";
import { VaultGuide } from "./Guide";
import { SignIn } from "./Keys";
import { demoSwitch, store } from "./store";
import { useAction } from "./ui";
import type { Member } from "./types";
import Vault from "./Vault";

// The Vault: its own app, with its own link and home-screen icon. Same two keys as Chez Bébé.
function App() {
  const [me, setMe] = useState<Member | null | undefined>(undefined);
  useEffect(() => {
    store.me().then(setMe).catch(() => setMe(null));
  }, []);
  if (me === undefined) return <div className="loading wordmark vault-loading">The Vault</div>;
  if (!me) return <SignIn onIn={setMe} vault />;
  return (
    <ChezProvider me={me}>
      {store.demo && (
        <div className="demo-bar">
          Demo: you're {me.who === "him" ? "him" : "her"}. <button onClick={demoSwitch}>Switch to {me.who === "him" ? "her" : "his"} side</button>
        </div>
      )}
      <Vault />
      <Footer onSignOut={() => setMe(null)} />
    </ChezProvider>
  );
}

function Footer({ onSignOut }: { onSignOut: () => void }) {
  const { me } = useChez();
  const seenKey = `chez:vault-guide:${me.user_id}`;
  // The guide opens by itself the first time
  const [guide, setGuide] = useState(() => {
    try {
      return !localStorage.getItem(seenKey);
    } catch {
      return false;
    }
  });
  const closeGuide = () => {
    try {
      localStorage.setItem(seenKey, "1");
    } catch {
      // fine
    }
    setGuide(false);
  };
  const [push, setPush] = useState<string | null>(null);
  const { run } = useAction();
  return (
    <footer className="vault-foot">
      <button className="link" onClick={() => setGuide(true)}>
        How the Vault works
      </button>
      {guide && <VaultGuide onClose={closeGuide} />}
      <button
        className="link"
        onClick={() =>
          run(async () => {
            const r = await store.enablePush();
            setPush(r === "on" ? "You'll be told when a letter arrives or is opened." : r === "denied" ? "Notifications are blocked for this site in your phone's Settings." : "Add the Vault to your Home Screen first, then try again.");
          })
        }
      >
        Notifications
      </button>
      {!store.demo && (
        <button
          className="link"
          onClick={async () => {
            await store.signOut();
            onSignOut();
          }}
        >
          Sign out
        </button>
      )}
      {push && <p className="small">{push}</p>}
    </footer>
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
