import type { ReactNode } from "react";
import { useChez } from "./data";
import { CROWNS } from "./logic";
import { Icon, MoodIcon } from "./ui";

/** Which phone is this? So the instructions match what she sees. */
const device = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iphone" as const;
  if (/SamsungBrowser/.test(ua)) return "samsung" as const;
  if (/Android/.test(ua)) return "android" as const;
  return "computer" as const;
};

function Install({ app }: { app: string }) {
  const d = device();
  return (
    <ol className="steps">
      {d === "iphone" && (
        <>
          <li>Open this page in Safari.</li>
          <li>
            Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.
          </li>
          <li>Open {app} from its new icon. It opens full screen, like an app.</li>
        </>
      )}
      {d === "samsung" && (
        <>
          <li>
            Tap the menu <b>☰</b> at the bottom right.
          </li>
          <li>
            Tap <b>Add page to</b>, then <b>Home screen</b>.
          </li>
          <li>Open {app} from its new icon.</li>
        </>
      )}
      {d === "android" && (
        <>
          <li>
            In Chrome, tap the menu <b>⋮</b> at the top right.
          </li>
          <li>
            Tap <b>Add to Home screen</b> (or <b>Install app</b>).
          </li>
          <li>Open {app} from its new icon.</li>
        </>
      )}
      {d === "computer" && (
        <>
          <li>Bookmark this page, or in Chrome use the install icon at the right of the address bar.</li>
          <li>On your phone, it's best added to the Home screen: open the same link there.</li>
        </>
      )}
    </ol>
  );
}

function Section({ id, icon, title, children }: { id: string; icon: string; title: string; children: ReactNode }) {
  return (
    <section className="guide-sec" id={`g-${id}`}>
      <h2>
        <span className="guide-ico">
          <Icon name={icon} size={20} />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The house guide: everything Chez Bébé does, in its own voice. */
export function HouseGuide({ first }: { first?: boolean }) {
  const { me, partner } = useChez();
  const them = partner?.name ?? "him";
  const her = me.who === "her";
  const go = (id: string) => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const toc = [
    ["start", "First things"],
    ["home", "Home"],
    ["day", "Your day"],
    ["court", "The Court"],
    ["duel", "The Duel"],
    ["board", "The Board"],
    ["crowns", "Crowns"],
    ["us", "Lore & Timeline"],
    ["settings", "Settings"],
    ["rules", "House rules"],
  ];
  return (
    <div className="page guide">
      <header className="page-head">
        <p className="kicker">{first ? "Welcome home" : "The house guide"}</p>
        <h1>{her ? "Your house, Your Majesty" : "How the house works"}</h1>
        <p className="guide-lead">
          Chez Bébé is a private house for two. Only two keys exist: yours and {them}'s. Nobody else can get in, see anything, or even make an account. Here's everything it does.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Contents">
        {toc.map(([id, label]) => (
          <button key={id} onClick={() => go(id)}>
            {label}
          </button>
        ))}
      </nav>

      <Section id="start" icon="key" title="First things">
        <p>
          <b>Put it on your home screen</b>, so it opens like a real app:
        </p>
        <Install app="Chez Bébé" />
        <p>
          <b>Turn on notifications</b>, so decrees, cases and good mornings reach you even when it's closed: tap the <b>gear</b> at the top, then <b>Turn on notifications</b>.
        </p>
        <p className="muted small">The tabs along the bottom are the rooms of the house: Home, Court, Duel, Board and Us.</p>
      </Section>

      <Section id="home" icon="home" title="Home">
        <p>Today in the house, at a glance:</p>
        <ul>
          <li>
            <b>Today at Chez Bébé:</b> how both your days are going, side by side.
          </li>
          <li>
            <b>Good morning:</b> {her ? `${them}'s greeting arrives here. Reply in one tap: "Acknowledged.", "Noted, citizen.", "tch" or ❤️.` : "send yours, and see their reply."} Send your own too: it keeps a streak.
          </li>
          <li>
            <b>Waiting for you:</b> decrees to carry out, cases needing your defence, and cases ready for your verdict. A dot on the Court tab means something's there.
          </li>
          <li>
            <b>The Board</b> and <b>Today's duel</b>, <b>Saving up</b> for your goals, and <b>Coming up</b>: the next date that matters.
          </li>
        </ul>
        <p className="muted small">On special days, like the 1st of every month, Home has a little surprise at the top.</p>
      </Section>

      <Section id="day" icon="us" title="Your day">
        <div className="guide-moods">
          <MoodIcon mood="sun" size={34} />
          <MoodIcon mood="cloud" size={34} />
          <MoodIcon mood="rain" size={34} />
        </div>
        <p>
          Tap <b>How's your day?</b> on Home: a good, okay or rough day, plus a line or a quick voice note if you like. You can also send a note with it.
        </p>
        <p>
          <b>Saved notes</b> are one-tap messages written once in your own words, for busy days. Write one when you check in and it stays there for next time.
        </p>
        <p>
          <b>Rough days:</b> when either of you picks the rain cloud, the house goes quiet for you. No new cases, no decrees, no duel nudges, and the other one is told: <i>"No jokes. Just be there."</i> They can press <b>I'm here</b>, and your screen softly lights up to say so. Banter comes back when your day gets better (or tomorrow).
        </p>
      </Section>

      <Section id="court" icon="gavel" title="The Court">
        <p>Where disagreements are settled, officially.</p>
        <ol className="steps">
          <li>
            <b>File a case</b> against the other: the case name ("My gut says so") and the charge.
          </li>
          <li>The accused writes their defence.</li>
          <li>
            The one who filed it gives the verdict: <b>Guilty</b>, <b>Pardon</b> or <b>Dismiss</b>, with a sentence if you like.
          </li>
        </ol>
        <p>The record at the top keeps score of who's won the most. Neither of you can write the other's part: the court is fair (in theory).</p>
        <p>
          <b>Decrees</b> (the second tab in the Court) are official requests: <i>"A good morning before 9am."</i> The other taps <b>Done</b> when it's carried out.
        </p>
      </Section>

      <Section id="duel" icon="play" title="The Duel">
        <p>
          A new Sudoku every day, the same one for both of you. Tap <b>Start the clock</b>, tap a square, then a number.
        </p>
        <ul>
          <li>Fastest wins the day. Each mistake adds 10 seconds.</li>
          <li>
            <b>Notes</b> lets you pencil in small numbers while you think.
          </li>
          <li>Your time stays hidden from the other until they've finished too. No peeking, no pressure.</li>
          <li>One go each per day, and it saves if you leave halfway.</li>
        </ul>
      </Section>

      <Section id="board" icon="board" title="The Board">
        <p>Castles, houses, places and dreams: everything you'd send each other as reels, kept in one place.</p>
        <ol className="steps">
          <li>
            Tap <b>Pin</b>, add a photo (a screenshot of the reel works), what it is and where.
          </li>
          <li>Paste the reel's link if you want it to open from the pin.</li>
          <li>
            Tap any pin and <b>Make it a goal</b> to start saving crowns towards it.
          </li>
        </ol>
        <p className="muted small">New pins from the other one show on Home as new properties.</p>
      </Section>

      <Section id="crowns" icon="crown" title="Crowns">
        <p>Everything you do in the house earns crowns, and your crowns fill the other one's goals.</p>
        <table className="guide-table">
          <tbody>
            <tr>
              <td>Good morning (once a day)</td>
              <td>{CROWNS.greeting}</td>
            </tr>
            <tr>
              <td>Check in (once a day)</td>
              <td>{CROWNS.checkin}</td>
            </tr>
            <tr>
              <td>Carry out a decree</td>
              <td>{CROWNS.decree}</td>
            </tr>
            <tr>
              <td>Win the day's duel</td>
              <td>{CROWNS.duel}</td>
            </tr>
            <tr>
              <td>Win a case</td>
              <td>{CROWNS.case}</td>
            </tr>
            <tr>
              <td>Add to the Lore</td>
              <td>{CROWNS.lore}</td>
            </tr>
          </tbody>
        </table>
        <p>{her ? `So every good morning ${them} sends builds your castle, and yours build towards his GTA 6. The deal is the deal.` : "So your crowns build her castle, and hers build towards your GTA 6. The deal is the deal."}</p>
      </Section>

      <Section id="us" icon="us" title="Lore & Timeline">
        <p>
          <b>The Lore</b> is the story of you two: quotes, moments, photos and voice notes, numbered from No. 001. To keep a voice note from Instagram or WhatsApp, screen-record it playing, then <b>Add → Voice note → Upload</b>: only the sound is kept, and you can trim it.
        </p>
        <p>
          <b>The Timeline</b> has your dates: when you matched, your anniversary (celebrated every month), how long you've been together, and one date still to be decided: <i>the first time in the same room</i>.
        </p>
      </Section>

      <Section id="settings" icon="gear" title="Settings">
        <p>The gear at the top: notifications, your saved notes, and a button to download a copy of everything written in the house. It's yours to keep.</p>
      </Section>

      <Section id="rules" icon="seal" title="House rules">
        <ol className="steps rules">
          <li>The owner is always right. Appeals may be filed with the Court.</li>
          <li>No jokes on rough days. The house will tell you.</li>
          <li>Good mornings are not optional. They're counted.</li>
          <li>Decrees are law.</li>
          <li>There's another place, for letters. It isn't in this house. {her ? "You'll be told how to find it." : ""}</li>
        </ol>
      </Section>

      <a className="btn primary wide guide-done" href="#/">
        {first ? "Walk in" : "Back home"}
      </a>
    </div>
  );
}

/** The Vault's own guide. */
export function VaultGuide({ onClose }: { onClose: () => void }) {
  const { partner } = useChez();
  const them = partner?.name ?? "him";
  return (
    <div className="letter-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <article className="vault-guide" role="dialog" aria-modal="true" aria-label="How the Vault works">
        <p className="kicker">The Vault</p>
        <h2>How it works</h2>
        <p>
          Letters for later, from {them} to you, and from you to {them}. Each one stays sealed until its moment. Before then you'll only see the envelope: who it's from, what it's for, and when it opens. Nobody can read the words early, not even by looking behind the scenes.
        </p>

        <h3>Put it on your home screen</h3>
        <p className="muted small">The Vault is its own app, with its own icon (a wax seal). Same key as Chez Bébé.</p>
        <Install app="the Vault" />

        <h3>When letters open</h3>
        <ul>
          <li>
            <b>Open now!</b> Ready straight away.
          </li>
          <li>
            <b>On a date:</b> it opens at midnight on its day. Until then it waits in <i>Sealed for you</i>.
          </li>
          <li>
            <b>Open when…</b> You decide the moment: "Open when you miss me", "when you can't sleep". You'll be asked "Is this the moment?" first, and {them} will know you opened it.
          </li>
          <li>
            <b>The first time in the same room</b> and <b>the wedding day:</b> these need two keys. When the day comes, you both tap <b>Turn your key</b> (within the same day), and they open. Neither of you can open them alone.
          </li>
        </ul>

        <h3>Inside an envelope</h3>
        <p>
          A letter, sometimes a taped-in photo, a voice note, little cards, and sometimes a strip that says <b>Take what you need</b>: tear off a tab (strength, laughter, peace…) when you need it, and read the note behind it. Each tab only tears once, so choose well.
        </p>

        <h3>Writing your own</h3>
        <ol className="steps">
          <li>
            Tap <b>Write a letter</b> and choose when it can be opened.
          </li>
          <li>
            Choose the envelope: draw the front on paper and photograph it, or pick a style.
          </li>
          <li>Write it, pick the paper, and add a photo, a voice note, cards or tear-off tabs if you like.</li>
          <li>
            <b>Seal it.</b> You can change it until it's opened. After that, it belongs to them.
          </li>
        </ol>

        <h3>Notifications</h3>
        <p className="muted small">Tap Notifications at the bottom of the Vault to be told when a letter arrives, or when yours is opened.</p>

        <button className="btn gold wide" onClick={onClose}>
          Close
        </button>
      </article>
    </div>
  );
}
