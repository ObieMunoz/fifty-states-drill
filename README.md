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
| `npm test` | Vitest suite over the data and game logic. |
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
  hooks/      the imperative edges: viewBox animation, reduced motion, the clock, the theme
  components/ the map, the chrome, and one panel per mode
  styles/     global CSS, split by concern and loaded in cascade order
```

`game/` holds every rule the app has and imports nothing from React, so it can be read
and tested on its own — which is what `src/__tests__/game.test.ts` does. The reducer is
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
