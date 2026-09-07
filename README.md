# Fifty States Drill

A single-page app for actually memorising the 50 US states — where they are, what
shape they are, their capitals, postal codes and who they border.

**Live:** https://obiemunoz.github.io/fifty-states-drill/

No build tooling, no dependencies, no network calls at runtime beyond a Google Fonts
stylesheet. The whole app — map geometry included — is one HTML file.

## Modes

**Learn**

| Mode | What it does |
| --- | --- |
| Map | Tap any state for its capital, postal code, admission date and order, census division, and the states it borders. |
| By Letter | The 19 first-letter groups, lit up on the map. Eight states start with **M** and eight with **N** — nearly a third of the map in two groups. |

**Quiz**

| Mode | What it does |
| --- | --- |
| Find It | Named state, tap it on the map. |
| Name It | A state highlights; pick it from four. |
| Name All 50 | Free-recall sprint against the clock. The map fills in as you type; misses are revealed at the end. Best time is saved. |
| Capitals | Type the capital. |
| Postal Codes | Type the two-letter code. |
| Borders | "Which one borders Ohio?" |

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
- **The region selector doubles as zoom.** Picking *New England* both restricts the
  question pool and zooms the map about 3×, which is what makes Rhode Island and
  Delaware tappable on a phone.

Progress is stored in `localStorage`, so it is per-browser and never leaves the device.

## Map data

State geometry comes from [us-atlas](https://github.com/topojson/us-atlas)
(`states-albers-10m`, Albers equal-area, Alaska inset at ⅓ scale), which is derived from
US Census Bureau cartographic boundary files. The TopoJSON was decoded and simplified
per-*arc* rather than per-ring, so borders shared between two states stay identical and
no gaps open up between neighbours. Decoding the arcs also yields true state adjacency,
which drives both the Borders quiz and the neighbour-based distractors.

## Editing

`artifact.html` is the source of truth. It is the body-only form (no `doctype`, `head`
or `body` of its own) that Claude Artifacts requires. `build.sh` wraps it into the
standalone `index.html` that GitHub Pages serves:

```sh
./build.sh
```

Both files are committed — Pages serves `index.html` directly, so it must stay in sync.
Edit `artifact.html`, run `build.sh`, commit both.
