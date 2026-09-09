# Fifty States Drill

A single-page app for actually memorising the 50 US states — where they are, what
shape they are, their capitals, postal codes and who they border.

**Live:** https://obiemunoz.github.io/fifty-states-drill/

A React + TypeScript single-page app, built with Vite and published to GitHub Pages.
No network calls at runtime beyond a Google Fonts stylesheet — the map geometry ships
in the bundle.

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
and the table can be cleared from the UI. Nothing is uploaded and nobody signs in.

### How it works without a server

The site is static files on GitHub Pages, which cannot run any code of its own — so it
does not try to. The two browsers find each other through a public relay, which carries
only the WebRTC handshake, and then talk **directly** over a peer-to-peer data channel.
No question, answer or score ever reaches a third party.

Two relay networks are used rather than one, since public relays are volunteer-run and
any single one can be down. If the first has not produced a peer within five seconds the
second is added alongside it; both stay up, messages go out on every link that has the
peer, and the receiver drops duplicates by sequence number. That removes any need for the
two sides to agree on which link is "the" one — a race they could otherwise lose in
opposite directions.

Fairness rests on both devices generating the identical question sequence rather than one
sending questions to the other. The host picks a seed, both sides run the same seeded PRNG
over it, and `versus/plan.ts` turns that into the match. This is why `lib/random.ts` takes
an optional generator: solo play still uses `Math.random`, while a match threads a seeded
one through the same code. Two things had to be kept out of that path — player progress,
which differs per device and would pull the two apart, and each player's own difficulty,
which is drawn from a separate generator so one side's decoys cannot perturb the other's.

The host is the only side that decides when a round ends, so the screens stay in step.
Everything else — building the question, grading it, timing the answer, totalling the
score — each device does for itself. Speed is measured from each player's own paint, so
clock skew between the two phones cannot affect it.

Nobody is authoritative over scores, so a determined player could lie about theirs. For a
game two people play sitting next to each other, that is not worth defending against.

### Testing a match locally

Two tabs on one machine are the one case WebRTC cannot handle unaided: their only host
candidate is an mDNS `.local` name neither tab can resolve, and the reflexive pair would
have to hairpin back through the same NAT. `versus/net.ts` turns on Trystero's loopback
fallback when the hostname is localhost, which makes a two-window match work in
development. It is off everywhere else, where real LAN candidates make it unnecessary.

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
npm run dev        # http://localhost:5173/fifty-states-drill/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload. |
| `npm run build` | Type-checks, then builds to `dist/`. |
| `npm run preview` | Serves `dist/` exactly as Pages will. |
| `npm test` | Vitest suite over the data, game logic and versus rules. |
| `npm run lint` | ESLint over `src/`. |
| `npm run typecheck` | Types only, no build. |

`vite.config.ts` sets `base` to `/fifty-states-drill/`, the repo name, because the site
is a Pages *project* page rather than a user page. Rename the repo and that has to
change with it.

### Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which lints, tests, builds and publishes `dist/` via `actions/deploy-pages`. Nothing
built is committed. This needs **Settings → Pages → Source** set to **GitHub Actions**.

Pull requests and other branches run the same checks without deploying, via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Layout

```
src/
  data/       states.json and the tables that describe modes, difficulty and hooks
  lib/        pure helpers: text matching, map framing, randomness
  game/       state shape, reducer, question engine, scoring — no React
  versus/     the two-player match: planning, scoring, state machine, transport
  hooks/      the imperative edges: viewBox animation, reduced motion, the clock, the theme
  components/ the map, the chrome, and one panel per mode
  styles/     global CSS, split by concern and loaded in cascade order
```

`game/` and `versus/` hold every rule the app has and import nothing from React, so they
can be read and tested on their own — which is what `src/__tests__/game.test.ts`,
`versus.test.ts` and `versus-machine.test.ts` do. The reducer is
pure: question draws happen in `nextQuestion`, outside it, so the same state and action
always give the same result.

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
