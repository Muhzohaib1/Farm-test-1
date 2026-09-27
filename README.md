# Mir Farm (میر فارم) — Sheep & Goat Farm Manager

A mobile-first web app for a small sheep and goat farm in Dera Ismail Khan. It installs on an Android phone
like a normal app, works with no internet, and syncs when the connection returns. English and Urdu.

- **Data entry** (e.g. the farm manager): records births, matings, health, weights, sales and expenses.
- **Admin** (e.g. the owner abroad): sees everything, including profit & loss, and manages who can use the app.

---

## What it does

| Area | Features |
|---|---|
| Animals | Goat/sheep, breed (Beetal, Pahari, Dumba, Waziri, Cross, Other), parents, source, purchase price, status, photo. Next free tag is suggested (`D-01` females, `B-01` males, `K26-01` kids, `L26-01` lambs). Tags are never reused. Lost ear tags can be replaced with the same number. Profile page with full timeline, offspring, parents and growth chart. |
| Breeding | Matings with due date (goat 150 days, sheep 147). **Inbreeding check** blocks father×daughter, mother×son and full/half siblings (override needs a reason); warns on a shared grandparent. Births add live newborns to the herd with new tags. Births due / overdue list. |
| Health | Deworming with medicine group and a warning on the 3rd same group in a row. FAMACHA eyelid round (one animal per screen, 5 coloured buttons); scores 4–5 are flagged for deworming. Vaccines with reminders (PPR, ET, FMD, HS, goat pox, sheep pox, plus custom). Illness/treatment and deaths (cause, age at death). |
| Quarantine | Bought animals start a 21-day quarantine with a checklist and daily checks; they can join the main herd only when everything is done. |
| Growth | Weights over time, growth chart per animal, newborns compared by season. |
| Sheep | Shearing records with wool weight and income. |
| Money | Sales (Eid, meat, breeding stock) and expenses by category. Monthly and yearly profit/loss (admins only). Treatment, vaccine and dewormer costs and animal purchase prices are counted automatically. |
| Dashboard | Headcount by species, sex and age; births, deaths and newborn mortality for the last 12 months; herd size chart; and a **Needs attention** list. |
| Export | One Excel file with all data (one sheet per record type), or CSV per sheet. |

---

## Setup (one time, about 20 minutes)

The app works on a single phone straight away with no setup ("Use on this phone only"). To let the owner see
the farm from abroad, set up the free online database (Supabase) and put the app on the web (Netlify).

### 1. Create the online database (Supabase, free)

1. Go to <https://supabase.com>, sign up, and create a **New project** (any name, choose region *Mumbai* or *Singapore*).
2. Open **SQL Editor → New query**. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql).
   At the bottom, change `owner@example.com` to the **owner's email**, then click **Run**.
3. Open **Authentication → Users → Add user → Create new user**. Enter the owner's email and a password.
   Tick *Auto Confirm User*.
4. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key.

### 2. Put the app online (Netlify, free)

1. Go to <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** and pick this repository.
2. Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).
3. Under **Site configuration → Environment variables** add
   `VITE_SUPABASE_URL` = the Project URL and `VITE_SUPABASE_ANON_KEY` = the anon key. Deploy.

(Instead of step 3 you can paste the URL and key into the app itself on the first screen under *Online sync settings*.)

### 3. Add family members

1. Admin: open the app → **More → Settings → Users** → enter their email, choose *Data entry* or *Admin*, **Add user**.
2. In Supabase **Authentication → Users → Add user**, create the same email with a password (tick *Auto Confirm User*).
3. Give them the website link, email and password.

### 4. Install on the Android phone

1. Open the website link in **Chrome** (with internet).
2. Tap **⋮ → Add to Home screen / Install app**.
3. Open the app from the home screen, choose **اردو** if wanted, sign in once, and choose a 4-digit PIN.

After that, the app opens with the PIN and works without internet. The badge at the top shows
**✓ Synced**, **N changes waiting**, or **Offline — saved on phone**. Changes upload by themselves when internet returns.

---

## How offline sync works

- Every record is saved on the phone first (IndexedDB), then queued for upload.
- When online, the app uploads the queue and downloads only what changed since last time.
- If the same record was edited on two phones, the later edit wins. Records are never truly deleted, only marked as
  deleted, so nothing is lost.
- If two phones both add a new animal while offline, they could pick the same tag. The dashboard shows a
  **"Tag used twice"** alert so one can be renamed.

## Keeping the free database awake

Free Supabase projects pause after about 7 days with no activity. A small Netlify scheduled function
(`netlify/functions/keep-alive.mjs`) reads from the database once a day so that never happens. Check it under
Netlify → **Logs → Functions → keep-alive**: each day it should log `keep-alive: Supabase answered 200`.
If the project ever does pause, open the Supabase dashboard and click **Restore project**. No data is lost.

## Roles

| | Admin | Data entry |
|---|---|---|
| Add and edit all records | ✓ | ✓ |
| Delete records | ✓ | only their own, within 24 hours |
| Profit & loss reports | ✓ | — |
| Manage users | ✓ | — |

---

## For developers

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (farm rules + sync)
npm run build      # type-check + production build in dist/
```

- React + TypeScript + Vite, installable PWA (`vite-plugin-pwa`, offline precache).
- Local database: Dexie (IndexedDB), `src/db`. All farm rules are plain functions in `src/logic` with tests.
- Sync: `src/sync/sync.ts` (outbox + last-write-wins) against one Supabase table (`records`, JSON per row) —
  see `supabase/schema.sql`. Access is limited by Row Level Security to emails in `farm_members`.
- Translations: `src/i18n/en.ts` and `src/i18n/ur.ts` (TypeScript makes sure every English string has an Urdu one).
- Charts are small hand-written SVG components (`src/components/charts.tsx`) to keep the download small.
- Hash routing (`#/animals`) so it works on any static host without server rules.
