# Our Block, Our Stories

An interactive 3D browser game prototype (Three.js + Vite) for an individual design assignment.

> **Singapore, 2040 — a proposed future.** This is a speculative design scenario, not an existing government programme. Every character, photograph and story is fictional. No statistics, policies or endorsements are claimed.

You play **Marcus**, a young adult helping coordinator **Aisha** document three neighbourhood memories at a fictional HDB block. The point of the game is how a memory is kept: with context, with every account preserved, and only as widely as each contributor agrees.

---

## Status — please read first

This project was written and checked in a sandbox that **could not reach the npm registry**, so:

| Verified | Not verified |
|---|---|
| Every source file passes `node --check` | `npm install` with real dependencies |
| 25 plain-Node tests of the game logic (`npm test`) pass | `npm run build` (Vite production build) |
| The whole UI and game flow was driven in real Chromium (182 automated checks passed) **with a stand-in for Three.js** — movement, collisions, all three missions, kiosk, ending, reset, presenter mode, corrupted/blocked storage | **How the 3D scene actually looks** (lighting, colours, camera framing) — never rendered with real Three.js |
| | `package-lock.json` — it does not exist yet; `npm install` creates it |

So the code is **untested against real Three.js rendering**. Follow the steps below on your own machine; if the scene looks too dark/bright, see *Troubleshooting*.

---

## Run it

1. Install **Node.js LTS** (v18 or newer) from <https://nodejs.org>. Check with `node -v`.
2. Unzip the project and open the folder in **VS Code** (File → Open Folder…).
3. Open the VS Code terminal (Terminal → New Terminal) and run:

```bash
npm install
npm run dev
```

4. Open the address the terminal prints (normally <http://localhost:5173>) in Chrome, Edge, Firefox or Safari.

Do **not** double-click `index.html` — browsers block ES modules from `file://`, and the page will be blank.

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # serve the built dist/ at http://localhost:4173
npm test           # game-logic tests (plain Node, no browser)
```

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move |
| Drag mouse / touch | Rotate camera |
| Q / R, C | Rotate camera by keyboard, re-centre |
| E | Interact |
| J | Memory journal |
| M | Mute |
| Esc | Pause / close panel |
| 1–3, Enter | Dialogue choices / continue |

All dialogue is text (subtitles). Nothing advances by timer; there is no score, failure or combat.

## What is implemented

- Title, intro, HUD, dialogue, memory journal, archive board, pause/settings, ending summary, About screen, controls screen.
- Explorable low-poly world: void deck (Aisha, memory board, kiosk) → corridor (Madam Devi and Mr Rahman) → Lim family living room → quiet corner (Auntie Salmah). Walls, furniture and world bounds block the player; the camera shortens so it does not pass through walls.
- **Mission 1 — The Dinner Everyone Remembers.** Examine photo, pot and note; hear Uncle Lim and Mei; attach two *verified* details (an unverified one is gently refused); keep both recollections; choose sharing that matches what both agreed.
- **Mission 2 — The Corridor Gathering.** Hear both neighbours; keep both perspectives; mark the date as uncertain rather than guessing; add context notes; honour each person's name-display wish ("a neighbour").
- **Mission 3 — A Memory Worth Keeping Private.** Auntie Salmah's wish is shown on screen. Choosing Public or Do-not-save is gently explained; Family-only completes it. It then appears only in the restricted list, never on the public board.
- **Kiosk contribution form** with three bundled illustrations, title, story, year or "Date unknown", optional people, and audience (Public / Family-only / Private draft). Labelled "Demo only — please do not enter sensitive personal information." It flags phone numbers/emails/NRIC-like text. No uploads; nothing leaves the browser.
- **Archive:** public board vs restricted list vs private drafts are separate lists. Only public records are drawn on the in-world board. Audience can be changed or the record deleted from the journal.
- **Accessibility/comfort:** subtitles, mute, reduced-motion toggle, keyboard-only operation, focus trapping in panels, "I'm stuck" recovery, no flashing.
- **Progress** in `localStorage` (demo only) with Reset. If storage is blocked or corrupt, the game still runs and warns that progress will not be saved.
- **Presenter mode** (separate save slot): all missions ready, jump buttons, a 3-minute run sheet, full reset. A skipped mission can be *staged*, and is then labelled "Documented — staged for demo (not completed by player)" everywhere, including the HUD and ending summary.

## What is simulated (say this out loud when presenting)

- The "service": no server, accounts, identity checks or real permissions. Audience settings change which in-game list a record appears in.
- "Restricted records" is a demo list on the same device, not access control.
- Residents, photographs and stories are fictional and drawn in code; all textures, models, illustrations and sounds are generated at runtime. No external assets.
- The contribution form stores text only in your own browser.

## Presentation

See [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md) for a 3-minute script and [`docs/TEST_CHECKLIST.md`](docs/TEST_CHECKLIST.md) for a manual test list.

## Troubleshooting

- **Blank page:** you opened the file directly. Use `npm run dev`.
- **`npm: command not found`:** install Node.js LTS and reopen the terminal.
- **Port in use:** Vite picks the next free port and prints it; or run `npx vite --port 5180`.
- **"WebGL not available" message / slow:** turn on hardware acceleration in the browser, or add `?low` to the address (`http://localhost:5173/?low`) to disable shadows and reduce effects.
- **Scene too dark or too bright:** edit the `LIGHT` object at the top of `src/world/config.js` (ambient, hemi, sun, lamp) and save; the page reloads.
- **Progress looks wrong:** Pause → *Reset demo*, or title screen → *Reset progress*.

## Known limitations

- Visual look and performance on real GPUs have not been checked (see Status).
- No `package-lock.json` until you run `npm install`; dependency versions are `^` ranges (three ^0.170, vite ^5.4).
- Desktop keyboard + mouse is the primary target. Touch can rotate the camera by drag, but there is no on-screen joystick.
- Characters are simple low-poly figures with basic idle animation.
- Audio is a small synthesised palette (clicks, chimes, soft ambient pad); no speech.
- Screen-reader support covers the DOM panels (labels, focus, live announcements) but the 3D scene itself is not described.
- Only one language (English); content is fixed, not editable in-game.

## Project layout

```
index.html            page shell, fallback/troubleshooting text
src/main.js           game loop, wiring
src/data/content.js   ALL story text, dialogue, copy
src/state/logic.js    pure game logic + storage (unit-tested)
src/world/            config, collision, scene kit, world, player, input
src/ui/               overlays, dialogue, journal, archive, HUD, screens
src/art/              canvas-drawn illustrations and textures
src/audio/sound.js    Web Audio synth
scripts/logic-test.mjs  `npm test`
```
