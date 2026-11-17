# Setting up Chez Bébé

About 30 minutes. Do steps 1 to 5 before 1 December; step 6 (notifications) is worth it but optional.

Nothing personal lives in the code. Names, dates, photos and voice notes all live in your own Supabase project, behind the two accounts. So the GitHub repo can be public (which free GitHub Pages needs).

## 1. A new Supabase project

Use a **new** project, not the Metic one: both have tables called `members` and `settings`.

1. [supabase.com](https://supabase.com) → **New project**. Name it `chez-bebe`, pick the London region, save the database password somewhere safe.
2. The free plan allows 2 active projects. If you're at the limit, pause one you're not using (Project Settings → General → Pause).

## 2. The database

**SQL Editor → New query**, paste all of `db/schema.sql`, **Run**. It also makes the private storage for photos and voice notes, and turns on live updates.

**Already set up before the Vault arrived?** Just run `db/migrations/002-vault.sql` the same way, once.

## 3. Your two keys

No real emails needed. Each of you gets a made-up house address that only Supabase sees; nothing is ever sent to it, and the sign-in screens only ask for the key.

1. **Authentication → Users → Add user → Create new user**
   - You: email `him@chez-bebe.local`, and a password of your own. Tick **Auto Confirm User**.
   - Her: email `her@chez-bebe.local`, and a temporary key (what you'll text her, e.g. `castle-for-lulu`). Tick **Auto Confirm User**.
2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Now nobody else can ever make an account.
3. **SQL Editor**, change the names if you like, then run:

```sql
insert into members (user_id, who, name, title)
select id, 'him', 'Abdulmalik', 'Guest (on probation)' from auth.users where email = 'him@chez-bebe.local';

insert into members (user_id, who, name, title)
select id, 'her', 'Her Majesty', 'Owner of Chez Bébé' from auth.users where email = 'her@chez-bebe.local';
```

`name` is what the app calls each of you everywhere; `title` sits under it on the home screen. Change them any time in **Table Editor → members**.

## 4. Put it online (VS Code terminal, PowerShell, one at a time)

Make an empty repo on GitHub called `chez-bebe` (Public, nothing ticked), then in the project folder:

```
npm install
```
```
git init
```
```
git add .
```
```
git commit -m "Chez Bébé"
```
```
git branch -M main
```
```
git remote add origin https://github.com/bhigayo/chez-bebe.git
```
```
git push -u origin main
```

Then on GitHub:

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** (Variables, not Secrets), add:
   - `VITE_SUPABASE_URL`: from Supabase **Project Settings → API**
   - `VITE_SUPABASE_ANON_KEY`: the publishable (anon) key, same page
3. **Actions → Deploy → Re-run all jobs**.

It'll be at `https://bhigayo.github.io/chez-bebe/`. Sign in as **The guest** with your password.

## 5. Get the house ready before she arrives

On your phone, before 1 December:

- **Us → Timeline → Add**: "We matched" (every year) and "Together" on 1 November as **Our anniversary**.
- **Board**: pin a few of the castles she's sent you. Make one a goal for her, and add GTA 6 as a goal for you.
- **Us → Lore**: add a couple of quotes ("your efforts have been noted, citizen").
- **Court → Decrees**: leave one waiting for her.
- **Home**: send your good morning on the day.

Add Chez Bébé to your Home Screen (Safari → Share → **Add to Home Screen**) so it opens like an app.

## 6. Notifications (optional, but makes decrees land)

In the project folder:

```
npx web-push generate-vapid-keys
```

It prints a **public** and a **private** key. Then (you'll need the Supabase CLI login you used for Metic):

```
npx supabase login
```
```
npx supabase link --project-ref YOUR-PROJECT-REF
```
```
npx supabase secrets set VAPID_PUBLIC_KEY=the-public-key VAPID_PRIVATE_KEY=the-private-key VAPID_SUBJECT=mailto:your@email
```
```
npx supabase functions deploy notify
```

The project ref is in the Supabase URL: `https://YOUR-PROJECT-REF.supabase.co`.

Last, add a third GitHub variable `VITE_VAPID_PUBLIC_KEY` (the **public** key only) and re-run the deploy. The private key never goes on GitHub.

Each of you then opens **Settings (the gear) → Turn on notifications**. On iPhone it only works once the app is on the Home Screen and opened from there.

## The reveal, 1 December

Text her:

> One month. Official notice: a property has been registered in your name.
> https://bhigayo.github.io/chez-bebe/#/keys
> Your key: castle-for-lulu

She breaks the seal, types that key, chooses her own (you won't know it), and walks in. After that she signs in as **The owner**.

Then add her voice-note reaction to the Lore as No. 001: **Us → Lore → Add → Voice note → Upload**, using a screen recording of it playing. Only the sound is kept, and you can trim the start and end.

## The Vault, its own reveal

The Vault has no door from Chez Bébé, so it arrives as its own moment. Seal "For our first month" for 1 December, then later that day text her:

> One more thing. Some letters are kept somewhere else.
> https://bhigayo.github.io/chez-bebe/vault.html

She signs in as **The owner** with the same key, and adds it to her Home Screen too (Share → Add to Home Screen): it gets its own wax-seal icon.

If you set up notifications before the Vault existed, redeploy the function once so Vault notifications open the Vault:

```
npx supabase functions deploy notify
```

## Good to know

- **Forgotten key?** There's no email to reset it by, so do it here: **SQL Editor**, change the key and run
  `update auth.users set encrypted_password = crypt('a-new-key', gen_salt('bf')) where email = 'her@chez-bebe.local';`
  then tell her the new key.

- **Try it without Supabase:** `npm run dev`. It runs as a demo in your browser, and the bar at the top switches between your side and hers.
- **Voice notes** are saved as WAV, which plays on both iPhone and Android, whichever phone recorded it.
- **The Vault** is its own app, at `https://bhigayo.github.io/chez-bebe/vault.html`, with its own Home Screen icon (a wax seal). There's no door to it from Chez Bébé; you send her the link. Same key as Chez Bébé, so no new account. Letters stay sealed until a date, until she decides ("Open when…"), until you're in the same room, or until your wedding day. The first meeting and wedding letters open only when you **both** turn your keys within the same day. Before then, only the envelope can be seen; the words can't be read even by looking in the database. Date letters open at midnight UK time, and show as ready the next time she opens the Vault.
- **Backup:** Settings → Download a copy saves everything written as one file.
- **Tests:** `npm test` checks the rules (crowns, streaks, court, quiet days, the timeline, the daily puzzle) and that strangers can't read or write anything.
