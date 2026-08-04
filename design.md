# Trellis — Design System & Visual Identity

|                      |                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**           | v3.0 — 2026-07-31 — **editorial, with instrument density in the grid**                                                                                                  |
| **Owns**             | Visual identity: palette, typography, layout concept, components, motion, voice, accessibility, the signature element                                                   |
| **Does not own**     | Surface-by-surface anatomy, component inventory/placement, and MVP/V1/V2 phase tags — those stay in [docs/11-ui-design-system.md](docs/11-ui-design-system.md)          |
| **Scope discipline** | Everything here is designed against **MVP** (Table + Kanban, 8 column types). V1/V2 surfaces are marked inline and must not be built early — see [CLAUDE.md](CLAUDE.md) |

---

## 1. Product context

Trellis is used all day by **Priya** — an agency producer, 34, at a 45-person digital studio, running twelve client retainers at once. She is not managing a project; she is managing _twelve_, and her real job is triage: scan a dense grid, see instantly what is slipping, fix it, move on. She lives in the Table view with her hands on the keyboard, and she opens the app forty times a day for ten seconds at a time.

The thing that separates Trellis from Linear, Jira, Asana, and Trello is not a feature — it is **who ends up looking at the screen**. Those tools are internal instruments; nobody outside the team ever sees a Jira board, so it can afford to be cryptic. Trellis's entire wedge is work that gets _shown to the person paying for it_ — client portals in V1, and in MVP the far more common version: **Priya screen-shares her board on a Thursday client call.** Compressed video, a client squinting at a laptop, no hovering, no explaining.

So Trellis has to be two things that normally trade off: **dense and fast at 60cm**, and **composed and legible at screen-share distance**. It should feel accountable — like a well-kept ledger someone signs their name to — not playful like monday.com's confetti, and not a darkroom terminal like Linear. The register is _professional service_: quiet, precise, presentable.

---

## 2. Design principles

Five, all derived from the above. None of them would survive being pasted into another product's brief.

1. **The board is an artifact, not a workspace.** Design every surface assuming an outsider will see it — on a screen-share today, in a client portal in V1. If a screen would embarrass Priya on a client call, it's a bug.
2. **Length before color.** Status, priority, and progress must be readable in grayscale, at 40% scale, and through video compression. Color reinforces meaning; it never carries it alone. This is why the signature element (§10) encodes state as _length_.
3. **Hover reveals affordances, never information.** You cannot hover for an audience. Drag handles, checkboxes, and row menus may appear on hover; a due date, an ID, or a status never may.
4. **The chrome is quiet so the data can be loud.** The app frame is ink and slate. The only saturated color on screen belongs to the user's own content — status labels, group identity, people. Twenty user-chosen label colors are already competing; the interface must not add a twenty-first.
5. **One bold thing.** The boldness budget is spent entirely on the status fill. Everything else — buttons, nav, cards, empty states — stays disciplined and unremarkable on purpose.

---

## 3. Color system

### 3.1 The interface has no brand colour

There's a constraint specific to project management: **the semantic layer has already claimed green, amber, and red.** In a PM tool green _means_ done, amber _means_ in progress, red _means_ blocked. A brand accent in any of those hues gets misread as a state. Most products resolve this by retreating into blue or violet — which is why every tool in this category looks the same, and why the indigo→violet chrome this document previously specified read as generated.

Trellis resolves it differently, and this is the position the whole system hangs off:

> **The chrome carries no hue at all. Every chromatic moment on screen belongs to the user's own data** — status labels, group identity, people.

That is not minimalism for its own sake. It is the only arrangement in which twenty user-chosen label colours can stay meaningful, and it is what makes a board legible when a client is looking at it over a screen-share. It also makes the product hard to mistake for anything else: in a category where the brand colour _is_ the identity, having none is the identity.

### 3.2 Core palette

| Role           | Name        | Hex       | Usage                                                                                                                    |
| -------------- | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frame          | `frame`     | `#EDEAE4` | The ground the sheet sits on. Never holds content directly.                                                              |
| Sidebar        | `sidebar`   | `#F3EFE8` | The left rail — a step deeper than paper so it reads as its own zone without a dark ground.                              |
| Paper          | `paper`     | `#FBFAF7` | Boards, panels, top bar, popovers. All content lives here.                                                               |
| Primary text   | `ink`       | `#1A1714` | Body, item names, headings. Also the primary button fill.                                                                |
| Secondary text | `ink-muted` | `#635A50` | Captions, column headers, values. 6.1:1 on paper.                                                                        |
| Tertiary text  | `ink-faint` | `#948A7E` | Timestamps, hints, inactive affordances.                                                                                 |
| Hairline       | `rule`      | `#DCD6CC` | Every rule in the product. Heavy rules use `ink` directly.                                                               |
| Link / action  | `deep`      | `#6B4A2F` | Links and hovers only. A tobacco umber deep enough to read as ink-with-warmth — it must never become "the brand colour". |
| Alert          | `alert`     | `#A3222B` | Past-due figures, destructive confirmation. Kept clearly redder than the umber so the two never blur.                    |

**Warm toward stone, never toward cream (2026-07-31).** The neutrals carry a deliberate warm cast — a true-neutral grey reads as unconsidered — but they are shifted toward _stone and putty_, not butter. This matters more here than in most products: **cream ground + serif display + terracotta accent is currently the single most recognisable AI-generated palette**, and this system already commits to a serif (§4). Stone gets the warmth without landing in that cluster. If a future revision reaches for `#F4F1EA` and a clay accent, it is walking directly into it.

**No gradients anywhere.** Not on buttons, not on the wordmark, not behind figures. The previous version rationed them to two places; v3.0 removes them entirely, because a gradient was the single loudest generated-design tell in the build.

### 3.3 Status colors — the semantic layer

These are the **default** status labels a new board ships with. Users may recolor from the 20-swatch palette (doc 02 §3.2) — that palette stays as-is, since it is user content.

| State           | Hex       | Fill length       | Glyph        |
| --------------- | --------- | ----------------- | ------------ |
| Not started     | `#A39A8D` | 12%               | —            |
| Working on it   | `#E08A1E` | pipeline position | —            |
| Stuck / Blocked | `#C4432F` | pipeline position | _(see note)_ |
| Done            | `#4E8A5C` | 100%              | `✓`          |

Warmed alongside the neutrals: the previous idle was a blue-grey slate that visibly fought a warm ground, and the greens/reds were neon enough to read as a different system from the chrome around them. They stay saturated enough to scan, which is safe **because of how the fill is built**: the label text is always drawn _beside_ the bar in `ink`, never on top of the colour. The bar only has to clear 3:1 as a graphical object, not 4.5:1 as text — the signature's construction is what lets the colour stay strong.

> **Glyph availability.** `✓` is driven by the `is_done` flag that status labels already carry (doc 02 §3.2). A blocked glyph has **no schema support in MVP** — there is no `is_blocked` flag, and inferring one from label text or color would break the moment a user renames or recolors a label. Until that flag exists, blocked-ness is carried by color plus the label's own text, which is honest and already legible. Do not ship text-matching inference for this.

**These are deliberately deeper and less saturated than monday.com's defaults** (`#00C875`, `#FDAB3D`, `#E2445C`). Neon greens and corals bloom and smear under video compression, and several fail 4.5:1 for text. Deepening them costs a little cheerfulness and buys screen-share legibility and contrast compliance — the right trade for principle 1.

### 3.4 Priority — a status preset, not a new column type

Color plus glyph, so it survives grayscale and colorblindness (principle 2):

| Critical `#8E2434` ▲▲ | High `#B5323F` ▲ | Medium `#C77B1F` ▬ | Low `#5A6377` ▽ |
| --------------------- | ---------------- | ------------------ | --------------- |

### 3.5 Usage rules

- **Gradients are rationed to two places:** the logo mark and the primary `+ New` CTA, both `brand-500 → violet`. Not on cards, not on stat tiles, not on a hero band, and never behind data — a gradient under content competes with the status layer for attention.
- **Stat-tile and identity color is a tint, not a fill:** a 12–14% tint of the accent behind a solid glyph. Full-strength accent blocks in the chrome pull focus from the grid.
- **Chip text color is computed, never eyeballed** — `labelTextColor()` in `packages/ui/src/colors.ts`, from relative luminance.
- **Overdue** is `#B5323F` text plus a dot, and only when the item is not in an `is_done` state.
- **AI-origin content carries no hue of its own.** It is marked by _form_ — a 1px dashed `indigo` border, a spark glyph, and a mono `AI` label — never by a dedicated violet. Adding a seventh hue to a screen already rendering twenty user-chosen label colors reduces legibility rather than increasing it; provisional-ness is better signalled by dashed-ness than by color. _(This revises doc 11 §E's `#7C5CFC`.)_

---

## 4. Typography

**One superfamily, three voices.** IBM Plex is self-hosted, open-licensed, holds up at 12px, and spans serif/sans/mono — so the three voices are siblings rather than a pairing that has to be argued for.

| Voice         | Face                       | Where                                                                                                                                                                                                                                        |
| ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document**  | IBM Plex Serif, 400        | Board titles, group titles, page titles, the Home greeting, figures in the summary line, the wordmark. This is the voice the client reads. Set at 400 weight, never bold — an editorial serif loses its composure when it's forced to shout. |
| **Interface** | IBM Plex Sans, 400/500/600 | Labels, buttons, item names, body copy. Everything you operate rather than read.                                                                                                                                                             |
| **Value**     | IBM Plex Mono, 400/500     | Dates, `TRL-1042` ids, counts, timestamps, status labels, the density readout. Anything read _as a value_. Tabular by construction, so columns align without `font-variant-numeric` patches.                                                 |

The serif is doing real work, not decoration: it is what makes a board read as a document that was _prepared_ rather than a screen that was generated — which is the entire argument of the product's wedge (§1). Uppercase eyebrow labels are sans, 10.5px, `0.13em` tracking; they mark structure, so they stay in the interface voice.

### 4.1 Scale

| px     | Weight        | Use                                      |
| ------ | ------------- | ---------------------------------------- |
| 32     | 600 condensed | Home greeting                            |
| 26     | 600 condensed | Board title                              |
| 20     | 600           | Item panel title                         |
| 16     | 500           | Card titles, section headers             |
| **14** | 400/500       | **Body, all grid cells — the workhorse** |
| 13     | 400/500 mono  | Column headers, dates, IDs, meta         |
| 11     | 500           | Non-essential only (see floor below)     |

**The 13px floor.** No text that carries information a user needs may render below 13px. 11px is permitted only for text that repeats something available elsewhere on screen. This is a direct consequence of the screen-share constraint and is the main place Trellis departs from Linear-style density, which uses 11–12px liberally for real data.

Line height 1.5 body, 1.25 headings. Weights 400/500/600 only — no 300, no 700.

---

## 5. Layout & spacing

### 5.1 The layout concept: ruled, not carded

**Nothing floats.** There are no cards, no rounded panels, and no shadows on any resting surface — structure is carried entirely by **rules and paper**, the way a printed table carries it. Radius is 2–4px everywhere (avatars excepted), which reads as "cut" rather than "rounded".

The hierarchy of rules is fixed and meaningful:

| Rule          | Weight                         | Means                                                                                          |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Section rule  | 1px `ink`                      | The top of a table, the underline beneath a section head — "a new body of content starts here" |
| Header rule   | 1px `ink` under a table header | Separates labels from values                                                                   |
| Row rule      | 1px `rule`                     | One record from the next                                                                       |
| Active marker | 2px `ink`, left edge           | The current nav item — a margin mark, not a filled pill                                        |

The sidebar is **paper, not a dark rail** (v2.0's dark navy rail was doing the most to make the product look generated). It's separated from the content by a single rule, exactly like every other division in the product.

Shadows survive in precisely two places, where something genuinely floats above the page: popovers/dialogs, and a row mid-drag.

Below 768px the sidebar becomes a bottom tab bar and the grid goes full-bleed.

### 5.1a Editorial frame, instrument grid

The one deliberate hybrid in the system, and the reason v3.0 exists in this shape: **the framing is editorial, the grid inside it is an instrument.**

Everything around the data — the masthead, the summary figures, the section rules, the board title — is set like a printed report, because that is what a client sees. The table itself is tuned for someone who is in it all day: mono values, hairline rules, no vertical borders, and rows that **tighten on demand**.

| Density                 | Row height | For                            |
| ----------------------- | ---------- | ------------------------------ |
| Comfortable _(default)_ | 38px       | Reading, reviewing, presenting |
| Compact                 | 30px       | Working the backlog            |

The toggle sits above the grid as a mono readout (`density: compact`) and persists in `localStorage`. It changes **only** row height and nothing about the page's character — the editorial frame is constant. This is what makes the hybrid a decision rather than a compromise: the two modes serve two different readers of the same screen, which is precisely the product's problem (§1).

### 5.2 Spacing and geometry

- **Scale:** 4px base — 4 / 8 / 12 / 16 / 24 / 32 / 48. Nothing off-scale.
- **Rhythm:** rows 36px · toolbars 36px · headers 48px · sidebar 248px (56px collapsed) · sheet margin 20px.
- **Radius:** sheet 12 · cards 10 · buttons 8 · chips/inputs 6 · **fills 2** · avatars full. The fill is nearly square on purpose — a measured bar should read as precise, not soft.
- **Elevation:** sheet `0 1px 3px rgb(20 26 46/.08), 0 8px 24px rgb(20 26 46/.06)` · popover `0 4px 16px rgb(20 26 46/.12)` · drag `0 12px 32px rgb(20 26 46/.18)`. Borders and shadows are alternatives, never both.

### 5.3 Core screens

**Sidebar** — dark rail: logo, workspace switcher, pinned nav, then boards. Each board row carries a colored dot in its own identity color: in an agency a board _is_ a client engagement, so the sidebar is really a client list and should read as one at a glance. The active row is a solid `brand-600` pill.

```
┌ nav #131A2B ───┐
│ ▣ Trellis    ‹ │
│ ┌────────────┐ │
│ │ ▪ OIT    ⌄ │ │  workspace switcher
│ └────────────┘ │
│ ▓▓ Home ▓▓▓▓▓▓ │  ← active: solid brand pill
│    Search      │
│                │
│  BOARDS        │
│  ● Acme — Web… │  ← identity dot, board's own color
│  ● Studio Req… │
│  ● Bug Tracker │
│                │
│ (KN) Priya N.  │
│      Northwind │
└────────────────┘
```

**Home** — greeting, then a four-tile stat row, then recents and the board grid. Every stat figure is computed from real items; there are deliberately **no sparklines or trend deltas**, because the product records no history to draw them from (§11).

```
┌ canvas ──────────────────────────────────────────────────────────┐
│  Good morning, Priya 👋            ⌕ Search…   [+ New ▾] 🔔 (KN) │
│  Here's what's happening in OIT today.                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ BOARDS ▣ │ │ IN PROG ▣│ │ DONE   ▣ │ │ OVERDUE ▣│  ← tinted   │
│  │ 4        │ │ 9        │ │ 8        │ │ 6        │    icon tile│
│  │ in this… │ │ status…  │ │ marked…  │ │ past due │             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘             │
└──────────────────────────────────────────────────────────────────┘
```

**Table view (flagship)** — sheet on desk. Sticky header, sticky item column, group sections with a colored spine. The Status column is the signature (§10).

```
┌─ desk ────────────────────────────────────────────────────────────┐
│  Client Work ▸ Acme — Website Redesign      ⌕ ⌘K   🔔   (KN)      │
│                                                                    │
│ ╔═ sheet ════════════════════════════════════════════════════════╗ │
│ ║ Acme — Website Redesign            [Table] Kanban    + New item ║ │
│ ║ ▾ Sprint 12   ▰▰▰▰▰▱▱▱  3 working · 1 stuck · 2 done            ║ │
│ ║ ───────────────────────────────────────────────────────────────  ║ │
│ ║ ☐ Item                       Status         Owner   Due         ║ │
│ ║ ───────────────────────────────────────────────────────────────  ║ │
│ ║▌☐ Homepage hero    TRL-1042  ▰▰▰▰▱▱▱▱ Work   (KN)   Jul 24      ║ │
│ ║▌☐ Copy deck v2     TRL-1043  ▰▰▰▰▰▰▰▰ Done   (TF)   Jul 10      ║ │
│ ║▌☐ Nav IA revision  TRL-1044  ▰▰▰▰▰▰▱▱ Stuck! (MR)   Jul 31 •    ║ │
│ ║▌  + Add item                                                    ║ │
│ ╚═════════════════════════════════════════════════════════════════╝ │
└────────────────────────────────────────────────────────────────────┘
```

Scanning the Status column vertically gives the shape of the project before a single word is read — and the group header carries the same language in aggregate.

**Kanban** — lanes from the status column. Cards are quiet: name, the fill, assignee, due. The fill appears on the card _even though the lane already encodes status_, because a card dragged mid-air and a card read at distance both need it.

```
┌ sheet ──────────────────────────────────────────────┐
│  Not started 4    Working on it 3    Stuck 1        │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │ Loaner pool  │ │ Homepage hero│ │ Nav IA rev.  │  │
│ │ ▰▱▱▱▱▱▱▱     │ │ ▰▰▰▰▱▱▱▱     │ │ ▰▰▰▰▰▰▱▱  !  │  │
│ │ TRL-1051 (—) │ │ TRL-1042 (KN)│ │ TRL-1044 (MR)│  │
│ │      Aug 7   │ │      Jul 24  │ │      Jul 31 •│  │
│ └──────────────┘ └──────────────┘ └──────────────┘  │
│ ┌──────────────┐ ┌──────────────┐ ┌ ─ ─ ─ ─ ─ ─ ┐  │
│ │ …            │ │ …            │   drag here      │
│ └──────────────┘ └──────────────┘ └ ─ ─ ─ ─ ─ ─ ┘  │
└─────────────────────────────────────────────────────┘
```

**Item detail panel** — right slide-over, 520px, route-synced (`?item=`), board stays live underneath. The facts grid reuses the exact table cell components, so an edit is the same interaction in both places.

```
                        ┌─ panel ─────────────────────┐
                        │ TRL-1042            ⋯    ✕  │
                        │ Homepage hero design        │
                        │ ─────────────────────────── │
                        │ Status   ▰▰▰▰▱▱▱▱ Working   │
                        │ Owner    (KN) K. Nakamura   │
                        │ Due      Jul 24             │
                        │ Qty      12                 │
                        │ ─────────────────────────── │
                        │ [ Updates ]   Activity      │
                        │ ┌─────────────────────────┐ │
                        │ │ Write an update… @ to   │ │
                        │ │ mention                 │ │
                        │ └─────────────────────────┘ │
                        │ (TF) Client approved the    │
                        │      direction.   2h ago    │
                        └─────────────────────────────┘
```

---

## 6. Core components

| Component                   | Spec                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status cell**             | The signature — see §10. Full spec there.                                                                                                                                                                                              |
| **Task card** (Kanban)      | `sheet`, radius 10, 1px `rule`, 12px padding. Name (2-line clamp, 14/500) · the fill · footer: assignee avatar, mono due date, comment count. Hover lifts 1px to `shadow-md`. No gradient, no color band.                              |
| **Board column / group**    | Header: collapse chevron, title in the group's color, mono count, and the aggregate fill bar with a text legend. The group header is the board's summary row — it is the only "chart" in MVP and it uses the signature's own language. |
| **Status badge** (non-grid) | Where a fill doesn't fit (breadcrumbs, notifications): 6px dot + label text at 13px. Never a saturated pill — pills at small size become the color-quilt problem.                                                                      |
| **Avatar / stack**          | Initials on a deterministic color from `colorForString`, 22/28/32px, mono initials. Stacks overlap −8px with a 2px `sheet` ring, `+N` overflow. No gradient rings.                                                                     |
| **Priority indicator**      | Glyph + color from §3.4, 13px mono glyph. Never color-only.                                                                                                                                                                            |
| **Button**                  | Primary: `indigo` fill, white text, radius 8, 32/36px. Outline: 1px `rule` on `sheet`. Ghost: `ink-muted`, hover `#EDEFF9`. Danger: `#B5323F`. Loading swaps the label for a spinner **at fixed width** — no layout shift.             |
| **Input**                   | 32/36px, radius 6, 1px `rule`; focus = `indigo` border + 2px `#A9B1E8` ring. Error: `#B5323F` border with a 13px message below.                                                                                                        |
| **Modal / popover**         | Radius 12, scrim `ink/40`. Enters at scale .98→1 + fade, 180ms. Popovers anchor under the cursor, not centered.                                                                                                                        |
| **Empty state**             | See below — a real screen, not a fallback.                                                                                                                                                                                             |

### 6.1 Empty states

An empty board is a frequent, _first_ screen in a PM tool — a new client engagement starts empty every time. It gets designed, not defaulted.

Every empty state is: **a headline naming what this place is** (display cut, 20px) · **one line saying what to do** · **one primary action** · optionally one quiet secondary. Never an illustration for its own sake, never "No data."

```
┌ sheet ──────────────────────────────────────────┐
│                                                 │
│        Nothing on this board yet                │
│        Add your first deliverable, or bring     │
│        one in from a spreadsheet.               │
│                                                 │
│        [ Add an item ]   Import from CSV        │
│                                                 │
└─────────────────────────────────────────────────┘
```

Three cases that must each have their own copy, because the user's situation is different in each: **empty board** (above), **filtered to nothing** ("No items match these filters" + _Clear filters_ — never let a filter look like data loss), and **empty search** ("Nothing matches _'hero'_ on this board" + scope hint).

---

## 7. Motion

Motion exists to explain a change of state. It never announces itself.

**Timing:** `fast 120ms` (hover, cell commit) · `base 180ms` (popovers, row insert) · `slow 240ms` (item panel, modals). `ease-out` entering, `ease-in-out` moving. Nothing exceeds 240ms.

| Where                           | What                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drag** (rows, cards, columns) | Lift = 1.02 scale + `shadow-drag`, source ghosts to 40%. Drop target = a 2px `indigo` insertion line (rows/columns) or a dashed slot (kanban). Settles in 180ms. **No tilt, no bounce, no spring.** |
| **Cell commit**                 | The fill animates its width 120ms to the new length. This is the one animation that carries information — you see the bar move.                                                                     |
| **Row insert**                  | Height + opacity in, 160ms.                                                                                                                                                                         |
| **Panel / modal**               | Slide 240ms / scale-fade 180ms.                                                                                                                                                                     |
| **Loading**                     | Skeletons shaped like the real rows, ≤400ms. Spinners only for actions that genuinely block.                                                                                                        |

**Cut from doc 11 §I.7: the confetti burst on completion.** It is decoration that isn't earned by the workflow, it fires during client screen-shares, and the boldness budget is already committed to the fill. Removed rather than kept-and-disabled.

`prefers-reduced-motion: reduce` disables everything above except opacity fades; the fill's width change becomes instant.

---

## 8. Voice & microcopy

Write from the user's side of the screen, in plain active English. The user has a client on the phone.

- **Their vocabulary, not the schema's.** "Assignee," not `user_id`. "Board," not "entity." "Due date," not "date_value."
- **Active and specific.** "Add an item" beats "Item creation." "Nothing matches these filters" beats "No results found."
- **Errors say what happened and what to do next**, in one sentence, and never blame the user: _"Couldn't save that status — you're offline. We'll retry automatically."_ Not _"Error: mutation failed (500)."_
- **Undo over confirmation.** Destructive actions produce a toast with **Undo** wired to the 30-day soft-delete window. Reserve confirmation dialogs for the genuinely irreversible.
- **Client-safe by default.** Nothing on a board surface may expose internal jargon, IDs beyond `TRL-####`, or debug language — anything on screen might be on a screen-share. Internal-only language belongs in settings and admin, never in the sheet.
- **AI copy is always hedged and attributed:** _"AI summary — may be imperfect,"_ with the source count (_"based on 24 comments"_). Never assert an AI output as fact.

---

## 9. Accessibility floor

Non-negotiable, checked before merge:

- **Contrast:** 4.5:1 for all text (including status chip text via computed `labelTextColor`), 3:1 for UI boundaries and graphical objects — including every fill bar against `sheet`.
- **Never color alone.** Status carries length + text, priority carries a glyph, overdue carries a dot. The design passes grayscale by construction (principle 2), which is also what makes it survive a compressed screen-share.
- **Focus is always visible:** 2px `#A9B1E8` ring offset 2px from an `indigo` border. Inside grid cells the ring sits _within_ the cell so it never shifts the row.
- **Keyboard-complete:** the grid is `role="grid"` with roving tabindex and arrow navigation; drag has keyboard sensors (space lift, arrows, space drop); every popover is a Radix primitive so focus trap and restore come free.
- **Type floor 13px** for information-bearing text (§4.1).
- **`prefers-reduced-motion`** honored per §7.
- Toasts are `aria-live="polite"`; the fill exposes its label as text to screen readers, never as a bare percentage.

---

## 10. Signature element — the status fill

**Every status cell is a bar whose length encodes pipeline position and whose color encodes state.**

Not monday.com's saturated full-cell block. Not Linear's small colored dot. A measured bar, left-aligned, 6px tall, radius 2, sitting above the label text at 13px:

```
Not started    ▰▱▱▱▱▱▱▱   slate,  12%
Working on it  ▰▰▰▰▱▱▱▱   amber,  pipeline position
Stuck          ▰▰▰▰▰▰▱▱   red,    pipeline position  !
Done           ▰▰▰▰▰▰▰▰   green,  100%
```

**How length is computed:** from data the product already has. A status column's `settings.labels` array _is_ an authored pipeline — board owners order it Not started → Working → Done. Fill length is the label's index in that order; any label flagged `is_done` renders 100%. No new schema, no configuration.

**Why this, and why it's Trellis's:**

- **It reads at every distance.** Length survives video compression, 40% scale, grayscale printing, and colorblindness — the screen-share constraint that defines this product (§1). A quilt of saturated blocks does not.
- **It makes the vertical scan work.** Priya's actual job is triage across many items. A column of fills is a bar chart down the grid: the shape of a project is visible before any word is read.
- **It carries two signals in one mark.** Red at three-quarters length says _"far along and blocked"_ — the single most actionable state in client work, and one that a colored dot cannot express at all.
- **It composes across every scale.** One item is a fill. One group is the stacked distribution bar in its header. One board is that bar in the board header. Same visual language from a cell to a summary — which is also why MVP needs no chart widget to be informative.

**Where it appears:** the Status cell in Table view · the Kanban card · the item panel facts grid · the group header (stacked aggregate) · collapsed group summaries. **Where it must not appear:** as decoration, in nav, in empty states, or on anything that isn't a real status value. This is the one bold element — diluting it by reusing the shape elsewhere is the specific failure mode to guard against.

---

## 11. What changed in the second pass, and why

Recorded so these don't quietly return:

| Cut                                                                                                    | Because                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark navy rail + indigo→violet gradient chrome                                                         | The single most recognisable generated-design combination in circulation. Replaced by paper and rules (§5.1).                                                                     |
| Gradient buttons, gradient logo tile                                                                   | A gradient is decoration standing in for a decision. Gone entirely (§3.2).                                                                                                        |
| The emoji greeting ("Good morning, Priya 👋")                                                          | Filler warmth. The greeting is now set in the document voice with the org and workspace above it — information, not a wave.                                                       |
| Four pastel stat tiles with tinted icon squares                                                        | _The_ AI-dashboard element. Replaced by a ruled figures line (§5.3).                                                                                                              |
| Board cards in a grid                                                                                  | A board list is a table of contents, so it's set as a ruled index.                                                                                                                |
| Full-cell saturated status blocks                                                                      | monday.com's signature, not ours — and a color-quilt at screen-share distance. Replaced by the fill (§10).                                                                        |
| The violet AI accent as a _hue_                                                                        | A dedicated AI color on a screen already carrying twenty user-chosen label colors. Provisional-ness is signalled by dashed form instead (§3.5).                                   |
| Confetti on completion (doc 11 §I.7)                                                                   | Decorative, unearned, and it fires mid-client-call.                                                                                                                               |
| Sparklines, trend deltas ("+2 from last month"), donut/area charts, Gantt strip                        | **No data exists to draw them.** The product records no historical snapshots, so every one of those marks would be invented. They return in V1 with dashboards, honestly sourced. |
| "Upgrade to Pro" CTA                                                                                   | The product is free and [CLAUDE.md](CLAUDE.md) forbids billing UI outright — no paywalls, no upgrade prompts. Not a style call.                                                   |
| Nav entries for Reports, Calendar, Files, Clients, Team                                                | V1/V2 scope with no APIs behind them. MVP ships **no dead buttons** (doc 11 §K).                                                                                                  |
| **Considered and rejected as the signature:** a "client sightline" rule marking client-visible columns | Genuinely Trellis-specific, but guest access is **V1** — a signature nobody can see in MVP isn't a signature. Its intent survives as principle 1.                                 |

**v3.0 revision (2026-07-31) — the reversal that matters.** v2.0 matched a reference dashboard and the result read, correctly, as AI slop. The specific tells, all now removed: a dark navy rail with an indigo→violet gradient; a gradient primary button and logo tile; an emoji greeting; four evenly-spaced stat cards with pastel-tinted icon squares; every surface a floating rounded card with a soft shadow; and no typographic conviction anywhere — one sans, sizes stepped up and down, nothing actually _set_.

The root cause is worth recording so it doesn't repeat: **matching a template produces a template.** Both reference screenshots were themselves generic dashboard designs; following them faithfully could only ever yield a generic dashboard. Direction now comes from the product's own argument (§1), not from a reference.

What survived every revision, and should keep surviving: **the status fill** (§10). Three chrome rewrites have not dented it, because it is derived from what the product actually is rather than from what other products look like. That is the test any future change should have to pass.

The discipline that remains non-negotiable is the bottom half of the table above: **nothing on screen may depict data the product doesn't have.**

**The specificity test.** At each major decision, a different product lands elsewhere: a fitness app takes an energetic accent (nothing forbids its greens and reds), a recipe site takes a warm editorial serif and photography-first layout (it has no dense grid and no 13px floor), a note-taking app has no semantic color layer at all and no reason to frame content as a presentable sheet. Every choice above traces to _twelve client engagements, one dense grid, and a client watching over a screen-share._

---

_Identity authority: this document. Surface anatomy, component placement, and phase tags: [docs/11-ui-design-system.md](docs/11-ui-design-system.md). Scope boundaries: [CLAUDE.md](CLAUDE.md)._
