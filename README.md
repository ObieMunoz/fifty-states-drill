# Fifty States Drill

A single-page app for actually memorising the 50 US states — where they are, what
shape they are, their capitals, postal codes and who they border.

**Live:** https://fifty-states-drill.vercel.app/

A React + TypeScript single-page app, built with Vite and hosted on Vercel. The study
modes make no network calls at runtime beyond a Google Fonts stylesheet — the map
geometry ships in the bundle. Versus, the two-player mode, talks to a small server; see
[Versus](#versus).

It installs as an app. On iPhone or iPad open the link in Safari and choose
**Share → Add to Home Screen**; on Android, Chrome offers **Install app** from its
menu; on desktop Chrome and Edge, use the install icon in the address bar. Once
installed, every mode except Versus works offline.

## Modes

**Learn**

| Mode | What it does |
| --- | --- |
| Map | Tap any state for its capital, postal code, admission date and order, census division, and the states it borders. |
| Letters | The 19 first-letter groups, lit up on the map. Eight states start with **M** and eight with **N** — nearly a third of the map in two groups. |
| Cards | Self-paced flashcards. Name on the front; capital, code, admission, nickname, region, borders and the state's silhouette on the back. **Need work** flags a state so the quizzes ask about it more often. |
| Hooks | Memory aids for the parts people actually get wrong — telling Vermont from New Hampshire, the Dakotas, the Carolinas, Missouri from Mississippi. All eighteen list by title; tap one to read it and light the states it talks about. |
| Progress | Weak spots, weakest first, with accuracy per quiz type and a **Drill these** button that narrows every quiz to just those states. |

**Quiz**

| Mode | What it does |
| --- | --- |
| Find It | Named state, tap it on the map. |
| Name It | A state highlights; pick it from four. |
| Silhouette | One state's outline alone — no map, no neighbours, no position. Shape recognition on its own. |
| Roll Call | Names only, no map at all. "Four states start with A" — type them, group by group, through all 19 letters. |
| Name All 50 | Free-recall sprint against the clock. The map fills in as you type; misses are revealed at the end. Best time is saved. |
| Capitals | Type the capital. |
| Postal Codes | Type the two-letter code. |
| Borders | "Which one borders Ohio?" |
| Mixed | All six question types shuffled together. Interleaving is harder in the moment and better for retention than drilling one type at a time. |

**Versus**

Two phones, the same questions, one clock. One player starts a room and reads out a
four-character code — or lets the other scan the QR — and both race through the same
sequence of questions. See [Versus](#versus) below.

## Difficulty

A **Level** control sits beside the mode tabs and changes how much scaffolding you get.
It applies to every quiz and is remembered between sessions.

| | Guided | Standard | Expert |
| --- | --- | --- | --- |
| Find It | Only the target's census division is lit; 3 tries | 2 tries | 1 try |
| Name It | Four options, decoys from other regions | Four options, neighbouring states as decoys | Type the name, no options |
| Name All 50 | Letter groups, per-letter counts, placeholders sized to each missing name | Letter groups and counts | No letter breakdown at all — just what you have found |
| Capitals | Pick from four | Type it | Type it, with no state highlighted on the map |
| Postal Codes | Pick from four | Type the code | Reversed: given `DE`, name the state |
| Borders | Four options, target highlighted | Four options, target highlighted | No highlight |
| Silhouette | Four options, decoys from other regions | Four options, neighbouring decoys | Type the name |

Guided caps mastery at *Learning* — a state only reaches *Solid* if you have got it
without multiple choice. Spelling stays forgiving at every level, since misspelling a
state you plainly know is not a knowledge failure; press Enter to submit a near miss.

## How it helps you learn

- **The map is the progress bar.** States deepen from pale paper to teal as you master
  them, and anything you have missed keeps a dashed red outline, so weak spots are
  visible at a glance.
- **Question selection is adaptive** — weighted toward what you do not know, with
  recently-asked states suppressed so you are not re-drilling the same four.
- **Distractors are geographic neighbours**, not random states, which makes a wrong
  answer informative rather than a coin flip.
- **Weak spots resurface.** Anything you miss is weighted more heavily in later
  questions, and Progress → *Drill these* narrows every quiz to only what you keep
  getting wrong.
- **The region selector doubles as zoom.** Picking *New England* both restricts the
  question pool and zooms the map about 3×, which is what makes Rhode Island and
  Delaware tappable on a phone.

Every hook in the Hooks screen is checked against the map data rather than written from
memory — that South Carolina touches exactly two states, that Utah and New Mexico share
no border and meet only at the Four Corners point, that Maine has exactly one neighbour.

Progress is stored in `localStorage`, so it is per-browser and never leaves the device.

The app follows your system light or dark setting by default. A **Theme** control in the
header overrides it either way, and the choice is remembered.

## Versus

A head-to-head match for two people, usually in the same room, on their own phones.

Both players get the **same question at the same moment** and score on speed: 100 points
for a right answer plus up to 50 more, decaying to zero across the round's clock. Whoever
banks more over 5, 10 or 15 rounds takes the match. It runs on the six scored quiz types
plus Mixed; Roll Call and Name All 50 sit it out, being long-form solo sprints rather
than one question at a time.

**Each player picks their own level.** A parent on Expert typing capitals blind and a
child on Guided picking from four options get the *same* state on the *same* round —
only the scaffolding differs, and both clocks are the longer of the two so the round
still ends together. That is what makes an uneven pairing a real race.

Finished matches go into a standings table in `localStorage`, so a household builds up a
running record of who beats whom. Names are remembered and pre-filled, and both the name
and the table can be cleared from the UI. Nobody signs in.

### Friends and rematch requests

The result screen offers to add the other player as a friend. Friends are listed on the
Versus menu, most recently played first, and each has a **Rematch** button: it opens a
room with you as host and sends a push notification to the friend's phone — "Obie wants a
rematch" — which opens the app straight into the room when tapped. The same button
appears on the result screen when a friend has left before you could play again.

Notifications are off until you turn them on, from the **Rematch requests** switch on the
Versus menu. On iPhone and iPad they are only available once the app is on the Home
Screen; a Safari tab is told to install first. Turning them off, or removing a friend,
takes effect at once: removing someone cuts the link on the server, so neither of you can
ping the other until you play again.

The friends list, like the standings, lives on the device. What the server keeps is the
minimum that makes a request safe to send: which phones can be reached, and which pairs
of players have finished a match together — only those may ping each other, no more than
once a minute, and a pairing nobody has renewed in three months is swept.

### How it works

A room lives on the server: one row for the room, one per player, one per answer, in a
[Supabase](https://supabase.com/) Postgres database. Every change a phone makes goes
through one API function on Vercel, `POST /api/versus` (`api/versus.ts`), which checks
the request against where the room is — only the host sets the rules, an answer counts
only for the round on screen, a match kicks off only when both are ready — and answers
with the whole room. Between calls the database pushes each row that changes to both
phones over a Realtime subscription (`versus/live.ts`), and Presence on the same channel
tells each phone whether the other is still there.

Both phones only ever connect *out*, to the server, which is why this works on any
network: two phones on cellular, on different Wi-Fi, or one of each. There is no
peer-to-peer link to negotiate.

Fairness rests on both devices generating the identical question sequence rather than
one sending questions to the other. At kick-off the server picks a seed, both phones run
the same seeded PRNG over it, and `versus/plan.ts` turns that into the match. The server
runs it too: it rebuilds each player's question from the seed and grades the answer
itself (`versus/grade.ts`), so the points that count are the server's, not each phone's.
Player progress and each player's own level are kept out of that path — the first differs
per device and would pull the two apart, the second is drawn from a separate generator so
one side's decoys cannot perturb the other's.

Clocks are local on purpose. A question's timer starts when it is painted on each phone,
not when the server wrote the row, so a slow link costs a player nothing; speed is
self-reported and capped at the round's clock. The server's time is consulted only to
place the clock when a phone comes back to a match in progress, and the host is the only
side that moves the match on, so the two screens stay in step.

A reload, a locked phone or a dropped connection is not leaving. The room is still on
the server, the URL still carries the code, and the phone comes straight back to its
seat — mid-round if need be. Only pressing **Leave** gives a seat up: the host's leaving
closes the room, a guest's hands the host the waiting room with the code still good.
Rooms nobody has touched for a day are swept away by a daily cron (`api/keepalive.ts`).

A rematch request is the one thing the server starts on its own initiative. The `rematch`
action creates a room the usual way, looks up the friend's push subscriptions, and sends
each one a small signed payload — the room code and the requester's name — through the
phone's push service with [`web-push`](https://github.com/web-push-libs/web-push)
(`server/push.ts`). The service worker (`src/sw.ts`) shows it as a notification and, on a
tap, opens `/versus/CODE`, which is the same path an invite link takes. Subscriptions and
pairings live in two more tables that the publishable key cannot read at all.

Every Versus screen shows the build it is running in the fine print, so two phones on
different builds — the first thing to rule out when something looks wrong — is visible at
a glance. The app reloads into a new deploy on its own, at once or the moment a match
ends (`src/pwa.ts`).

### Setting up the server

Two accounts, both on free tiers that this game will never come near the limits of.

**Supabase.** Create a project, then run the migrations in
[`supabase/migrations/`](supabase/migrations/) against it, in order — paste each into the
SQL editor in the dashboard, or `supabase db push` with the CLI. The first creates the
three room tables, lets the publishable key read them, and adds them to the Realtime
publication; the second adds the two tables behind rematch requests, which nothing but
the API can read. Note the project URL and, under **Project Settings → API**, the
*publishable* key and the *secret* key.

**Vercel.** Import the repository as a project; the defaults are right for Vite. Then
either connect Supabase from the Vercel Marketplace, which sets the variables the app
reads, or add them by hand from [`.env.example`](.env.example): the address and the
publishable key are built into the page and are public, the secret key is read only by
the API functions and must never get a `VITE_` prefix. `vercel.json` schedules the daily
sweep; set `CRON_SECRET` too and the function refuses anyone else. Every push to `main`
deploys.

**Rematch requests** need one more thing: a VAPID key pair, which is what signs each push
notification. Run `npx web-push generate-vapid-keys` once and set `VITE_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a `mailto:` for the push services to reach you).
Without them the app simply offers no notifications. Changing the pair later invalidates
every phone's subscription, so keep it. The public key is read by both the build and the
API, so one variable under the `VITE_` name serves both.

A free Supabase project pauses after a week without traffic. The daily cron is a query
against the database every day, which is what keeps it awake through a quiet fortnight.

### Running it locally

`npm run dev` serves the app alone: Versus will report that it cannot reach the server.
For a full local run, pull the project's environment once and start Vercel's dev server,
which serves the app and the API functions together:

```sh
npx vercel link
npx vercel env pull   # writes .env.local
npx vercel dev        # http://localhost:3000/
```

Two tabs on one machine make a perfectly good match: each holds its own player id.

### The old address

The app used to live on GitHub Pages. That address now serves only [`redirect/`](redirect/),
which sends a device on to the new site with everything it had saved — progress, theme,
name, standings — in the URL fragment, where `src/migrate.ts` imports it once. Nothing
already stored on the new site is overwritten, and the fragment never reaches a server.
Its `sw.js` is a self-destroying service worker: the old one checks for a new version on
every visit, finds it, and stands down, so the redirect is what loads rather than the
cached app shell.

## Map data

State geometry comes from [us-atlas](https://github.com/topojson/us-atlas)
(`states-albers-10m`, Albers equal-area, Alaska inset at ⅓ scale), which is derived from
US Census Bureau cartographic boundary files. The TopoJSON was decoded and simplified
per-*arc* rather than per-ring, so borders shared between two states stay identical and
no gaps open up between neighbours. Decoding the arcs also yields true state adjacency,
which drives both the Borders quiz and the neighbour-based distractors.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload. The study modes only; see [Running it locally](#running-it-locally) for Versus. |
| `npx vercel dev` | The app and the API functions together, as deployed. |
| `npm run build` | Type-checks, then builds to `dist/`. |
| `npm run preview` | Serves `dist/`. |
| `npm test` | Vitest suite over the data, game logic, versus rules and the room API. |
| `npm run lint` | ESLint over the app, the API and the tests. |
| `npm run typecheck` | Types only, no build. |
| `node scripts/make-icons.mjs` | Redraws the app icon and favicon into `public/`. Needs `rsvg-convert` and `magick`. |
| `node scripts/make-og.mjs` | Redraws the link-preview card into `public/og.png`. Needs `rsvg-convert`, and the network once for the fonts. |

### Icon and PWA

The icon is the mainland outline from `src/data/states.json`, unioned into one
shape by `scripts/make-icons.mjs`, with Missouri lit in the answer colour. The script
writes the SVG favicon, a legacy `.ico`, the Apple touch icon and the 192/512 px
Android icons (plain and maskable) into `public/`; the outputs are committed, so it
only runs again when the mark changes. `scripts/make-og.mjs` draws the same mark
onto the card that iMessage, Slack and X show under a link (`public/og.png`). It is
laid out on the usual 1200 × 630 canvas but written at 2400 × 1260, because Messages
on iOS draws an image full-width only at about that size and shows a small thumbnail
beside the title otherwise; the other renderers scale it down. `index.html` points the
Open Graph and Twitter tags at it with absolute addresses, since the preview is
fetched by their servers, not the browser.
An invite link, `/versus/CODE`, gets the same image with the room named in its title;
see [Addresses](#addresses).

`vite.config.ts` configures `vite-plugin-pwa`, which writes `manifest.webmanifest`
and a Workbox service worker into `dist/` at build time. The worker precaches the
app shell and caches the Google Fonts files on first use. A new deploy is picked up
in the background and the page reloads into it at once — or, if Versus is open, the
moment the player leaves it (`src/pwa.ts`). Without that, a phone that only ever
brings the app back from the switcher could sit on an old build for days.

### Deployment

Vercel builds and deploys every push to `main`, and gives every pull request a preview
of its own. Pull requests and other branches also run lint, tests and a build on GitHub,
via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) still publishes to GitHub
Pages, but only [`redirect/`](redirect/); see [The old address](#the-old-address).

## Addresses

Every mode has a path of its own, so a link opens that mode and the back button walks
through the modes visited. The map is `/`; the other Learn modes sit under `/learn/`
(`letters`, `cards`, `hooks`, `progress`) and the quizzes under `/quiz/` (`find-it`,
`name-it`, `silhouette`, `roll-call`, `all-50`, `capitals`, `postal-codes`, `borders`,
`mixed`). Versus is `/versus`, and a room is `/versus/CODE`. The table lives in
[`src/router.ts`](src/router.ts); an unknown path opens the map and is corrected in
the address bar. `vercel.json` sends every path that is not `/api/` to `index.html`,
and the service worker does the same offline.

`/versus/CODE` is the one path with a server behind it. `api/invite.ts` serves the
built `index.html` with the title and preview tags rewritten to name the room, so
the card iMessage or Slack draws under an invite says *Join room ACDE* rather than
describing the app. The page is otherwise identical, and the app reads the code out
of the path as it would have anyway. Links from before rooms had a path,
`/#versus=CODE`, still open the room.

## Layout

```
src/
  data/       states.json and the tables that describe modes, difficulty and hooks
  lib/        pure helpers: text matching, map framing, randomness
  game/       state shape, reducer, question engine, scoring — no React
  versus/     the two-player match: planning, grading, scoring, the room on this phone
  hooks/      the imperative edges: viewBox animation, reduced motion, the clock, the theme
  components/ the map, the chrome, and one panel per mode
  styles/     global CSS, split by concern and loaded in cascade order
  router.ts   the path each mode and room lives at, and the address bar
api/          the Vercel functions: the room API, the invite page and the daily sweep
server/       the room's rules, the invite page, and the Supabase adapter they run against
supabase/     the database migration
redirect/     what the old GitHub Pages address serves now
```

`game/`, `versus/` and `server/` hold every rule the app has and import nothing from
React, so they can be read and tested on their own — which is what
`src/__tests__/game.test.ts`, `versus.test.ts`, `versus-machine.test.ts` and
`server-rooms.test.ts` do. `server/rooms.ts` takes the database as an argument, so the
whole room lifecycle is tested against a few Maps. The reducers are pure: question draws
happen in `nextQuestion`, outside the solo one, and the versus one only applies snapshots
and local timing, so the same state and action always give the same result.

Two things are deliberately *not* declarative, and both are commented where they live:

- **The map's `viewBox`** is animated by writing the attribute directly
  ([`hooks/useViewBox.ts`](src/hooks/useViewBox.ts)). Re-rendering fifty paths sixty
  times a second would be wasted work, and React would fight the animation.
- **The Roll Call and Name All 50 inputs** are uncontrolled
  ([`RecallPanel`](src/components/panels/RecallPanel.tsx),
  [`RollPanel`](src/components/panels/RollPanel.tsx)). Accepting an answer must never
  rewrite the box mid-word, which drops keystrokes from a fast typist.

Progress lives in `localStorage` under `fiftyStatesDrill.v1`, in the same shape the
pre-React version wrote, so existing progress carries over untouched. The theme choice
is kept apart from it, under `fiftyStatesDrill.theme`, so a display preference never
touches the shape that older key promises.
