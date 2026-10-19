# Our Memory Garden

> **Singapore, 2040 — a proposed future experience.**
> This prototype demonstrates shared contribution and storytelling. It is not a permanent digital preservation service.

A shared 3D garden you can walk around. On the laptop the host shows a **QR code**; family and friends scan it with their **phones**, choose a **real photograph**, add a title and a short story, and send it. The photograph waits in a **host approval queue**. When the host approves it, a **memory plant grows live** in the garden — with the actual photograph on its card — and anyone can walk up, click the plant and read the story. Others can add their own recollections, which (after approval) grow as leaves on the same plant.

It is a design prototype for a shared remembering ritual (an interaction metaphor, not a reconstruction of history), built with **Three.js + Vite** for the browser game and a small **Node.js** server for phone uploads. No cloud services, no API keys, no accounts.

---

## Honest status — please read first

| Checked in the sandbox where this was written | **Not** checked (needs you, on real hardware) |
|---|---|
| Server: 19 automated tests — upload, validation, EXIF/metadata stripping, approval, auth, delete, expiry, restart persistence, live events, reconnect, log redaction (`npm test`) | **How the 3D scene looks.** The sandbox could not install Three.js (npm registry blocked), so the scene has *never been rendered*; layout maths was checked with a script, nothing more. If it looks too dark/bright see *Troubleshooting*. |
| Game state logic: 8 automated tests (idempotent updates, no duplicates after reconnect) | `npm install` of the dependencies, and `npm run build` (Vite) — not run here |
| Phone page in real Chromium (phone-sized): 34 checks — bad files, preview, validation, progress, private link, withdraw, locked/ended states | A **real phone over a real Wi-Fi/hotspot** — only a desktop Chromium emulating a phone, talking to the server over 127.0.0.1, was used |
| Whole host flow in real Chromium, with a **stand-in for Three.js**: 65 checks — QR drawn and decoded by an independent decoder, phone → queue → approve → plant appears live without reload → its card fetches the real photo → click opens the story → recollections become leaves → delete removes plant, files and public image → gathering place → resume → demo mode → server-down and session-lost messages | iPhone Safari / Android Chrome camera-roll behaviour, HEIC conversion by the phone, very large camera photos on a slow network |
| QR generator decoded correctly by OpenCV for versions 2–10 at all four error-correction levels (`npm run test:qr`) | Firewall prompts, campus Wi-Fi client isolation (see *Network*) |

So: the **data path from phone to garden is tested end-to-end**; the **look and feel of the 3D scene is not**. The first thing to do on your machine is `npm run showcase` and look at it.

---

## Run it

You need **Node.js 22.13 or newer** (the server uses Node's built-in SQLite). Check with `node -v`; install from <https://nodejs.org>. Then, in the project folder:

```bash
npm install            # once
npm run showcase       # builds the game and starts the server on port 3000
```

Open **http://localhost:3000** on the laptop (use `localhost` on the laptop, *not* the LAN address). Click **Start a live garden session**. The host panel opens with the QR code.

Other commands:

| Command | What it does |
|---|---|
| `npm run showcase` | `vite build`, then the server (serves the game, phone page, API from **one** address). Best for presenting. |
| `npm start` | Server only (the game must already be built with `npm run build`). |
| `npm run dev` | Developer mode: server on :3000 **and** Vite hot-reload on :5173. Open **http://localhost:5173**. |
| `npm run build` | Production build into `dist/`. |
| `npm run clear-data` | Delete the database and all uploaded photos in `data/` (stop the server first). |
| `npm test` | Server + state tests (no extra installs). |
| `npm run test:ui` | Real-Chromium UI tests with a Three.js stand-in. Needs `npm i -D playwright esbuild` and `npx playwright install chromium`. |
| `npm run test:qr` | Decodes the generated QR codes with OpenCV (`pip install opencv-python numpy`). |

Change the port: `PORT=3100 npm start` (macOS/Linux) or `$env:PORT=3100; npm start` (Windows PowerShell). All settings are in `.env.example`.

The first time, Windows or macOS may ask whether to let Node.js accept incoming connections: allow it on **private networks** only (see *Network*).

### Using it

1. **Laptop:** `npm run showcase` → open `http://localhost:3000` → *Start a live garden session*.
2. **Phone** (same Wi-Fi): scan the QR code → read the notice → *Choose a photo* → title, story, area, optional name/year → tick the permission box → *Send for approval*.
3. **Laptop:** the Approvals tab shows the photo large with its story. *Approve and plant*, *Do not display*, or *Delete*.
4. A plant grows live. Walk to it (WASD, drag to look) and press **E**, or just **click** it. Use **G** for a view of the whole garden, **H** for the host panel.
5. To let others add a recollection: open a memory → *Let others add theirs from a phone (QR)*. Each recollection also waits for your approval and then adds a leaf.
6. **Session tab:** pause uploads, end the session (link stops working), or delete all data now. Everything is deleted automatically after 4 hours (`SESSION_TTL_HOURS`).

No phone handy, or the Wi-Fi is hopeless? **Try the fictional demo** on the title screen: three invented memories drawn in code, a button that plants a fourth to show the gathering place growing, nothing uploaded, no server needed for the demo itself.

---

## Architecture

```
   PHONE (browser)                    LAPTOP (host)
 ┌──────────────────┐             ┌────────────────────────────────────────────────┐
 │ /join/<join-token>│  HTTP      │  Browser tab:  the 3D garden (Three.js)        │
 │  join.html/js/css │ ─────────► │   • GardenState  (idempotent public state)     │
 │  • pick photo     │  multipart │   • LiveSession  (HTTP + event stream)         │
 │  • resize ≤2000px │            │   • Host dock: QR (own generator), approvals   │
 │  • progress, retry│            └──────────────▲─────────────────────────────────┘
 └──────────────────┘                            │ events (SSE) + HTTP, host token in a header
          │ HTTP :3000                           │
          ▼                                      │
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │  Node.js server  (server/)           ONE address for game, phone page and API   │
 │   app.js     router, auth, rate limits, same-origin check, CSP, static files     │
 │   images.js  magic-byte check → sharp: decode, EXIF-rotate, strip metadata,      │
 │              resize, re-encode to WebP (display ≤1600px, thumb ≤640px)           │
 │   store.js   SQLite (node:sqlite): sessions, memories, responses                 │
 │   hub.js     Server-Sent Events: pub:<session> (phones) / host:<session> (host)  │
 │  data/garden.sqlite   data/uploads/<session>/…   (originals are never stored)    │
 └─────────────────────────────────────────────────────────────────────────────────┘

 Flow:  phone upload ─► server validates + re-encodes ─► status "pending" (private to host)
        host Approve ─► slot allocated ─► event "memory:upsert" ─► laptop GardenState
        ─► world.addMemory() ─► plant grows, card loads /api/p/<join>/media/<id>/thumb
        host Delete  ─► files + rows removed ─► event "memory:remove" ─► plant disposed
```

**Why Server-Sent Events rather than Socket.IO?** The sandbox could not install packages, and the garden only needs one-way "something changed" notifications. Everything that matters (including photographs) goes over ordinary HTTP; the event stream just tells the laptop when to update. On reconnect the client always reloads a full snapshot, and all updates are idempotent (keyed by memory id), so a dropped connection can never create duplicate plants — this is tested.

### Roles and tokens

| Who | Credential | Can do |
|---|---|---|
| **Host** (laptop browser) | 32-byte **host token**, kept in that browser's `localStorage`, sent in an `x-host-token` header — **never in a URL**. The server stores only its SHA-256 hash. Sessions can only be created from the computer running the server. | everything: queue, approve/hide/delete, lock, end, delete data |
| **Participant** (phone) | 24-byte **join token** in the link/QR (`/join/<token>`). | upload photos, add recollections to *displayed* memories, see displayed memories |
| **Contributor** (same phone) | Per-contribution **manage token** returned once, kept in the phone's `localStorage`, sent only in POST bodies, hashed on the server. The "private link" fragment (`#m=…`) is stripped from the address bar immediately. | check status, withdraw *their own* contribution |

Participants cannot reach host endpoints; host tokens are not in the QR, the join URL, server logs or any public response. Cross-site requests are refused (same-origin check on every state-changing call).

### What is real and what is simulated

| Real | Simulated / out of scope |
|---|---|
| Phone upload of a real photo, validated and re-encoded on the server | Households in **different places** — everyone must reach the laptop on one network. Internet-wide sharing needs a hosted deployment with proper security; it is not attempted here. |
| Host approval queue; live plant growth without refresh; photograph on a 3D card (aspect ratio kept) | Long-term preservation, backups, accounts, moderation tooling |
| Delete removes the stored files and rows; sessions expire automatically | The "Create a Memory Corner" kit and activity cards the concept builds on are *referenced*, not implemented |
| QR code encoding the **LAN address** (not `localhost`) | The fictional demo memories and their pictures (drawn in code, labelled "Fictional example") |

### Deviations from the preferred stack (and why)

The sandbox this was built in could not reach the npm registry, so only built-in Node features and the already-installed `sharp` image library could be used.

| Preferred | Used | Consequence |
|---|---|---|
| Express | Node `http` with a small router (`server/app.js`) | Same behaviour; ~700 lines you can read. |
| Socket.IO / WebSocket | Server-Sent Events + fetch streaming | One-way events are all that is needed. |
| multer | `Request.formData()` on a size-limited buffered body | Upload limit enforced before parsing (default 10 MB). |
| better-sqlite3 | `node:sqlite` (built in) | Requires Node ≥ 22.13; prints no warning via the npm scripts. |
| `qrcode` package | `src/qr.js` — a small QR generator written for this project | Verified against OpenCV for versions 2–10, all levels; supports links up to ~200 characters. |
| sharp | sharp (**the only runtime package besides Three.js**) | Native build; installs prebuilt binaries on common platforms. |

---

## Network: why a phone cannot open `localhost`

`localhost` means "this device". A phone told to open `http://localhost:3000` looks for the garden on **itself**. So the QR code must contain the laptop's **network address**, e.g. `http://192.168.1.20:3000/join/…`. The server finds it automatically and prints it at start-up; the host panel (Invite tab) shows what the QR currently encodes, warns if it is `localhost`, lists every detected address as a button, and lets you type another. You can also set `PUBLIC_HOST=192.168.1.20` in advance.

Phones and laptop must be on the **same network**, and that network must let devices talk to each other. Common problems:

- **Campus / hotel / guest Wi-Fi** often enables *client isolation*. Use your **phone's hotspot** (connect the laptop to it) or a small travel router.
- **Mobile data** cannot reach a laptop on Wi-Fi.
- **Firewall:** when Node.js asks, allow it on **private networks** only. If you dismissed the prompt, add an inbound rule for **port 3000** (or your `PORT`) on the private profile. Please do **not** turn the firewall off.
- **Exposing this to the public internet** is not supported. The security here suits a trusted network for a short demonstration (see below). If you ever host it publicly you would need HTTPS, rate limiting by a proper proxy, abuse handling and a privacy review first.

Camera-roll file pickers work over plain `http://` on a LAN. (Browsers only restrict *live camera capture* and some APIs to HTTPS; this page uses a normal file picker, which does not need it.)

---

## Privacy, retention and security (prototype level)

- Contributors see, before uploading: *"Your photo and story will be visible to people viewing this session after host approval."* They must tick a permission box (and for recollections, another) — nothing is sent without it.
- **Metadata:** every photograph is decoded and re-encoded server-side; EXIF/GPS/camera data is not carried over, and EXIF orientation is applied first so photos are upright. Originals are **never stored** — only a ≤1600 px display image and a ≤640 px thumbnail (WebP).
- **Validation:** type is decided by **magic bytes**, not file name or declared type. JPEG/PNG/WebP only; SVG, GIF, HEIC/HEIF/AVIF, executables and text are refused with plain-language messages. Size limit 10 MB (configurable), decoder pixel/dimension limits against decompression bombs, text lengths capped and control characters stripped. Text is only ever inserted into the page as text, never HTML.
- **Pending items are private:** the public snapshot/event/media endpoints return approved memories only; the host previews pending photos through a header-authenticated endpoint.
- **Limits:** 8 uploads / 12 recollections per 10 minutes per phone address per session; 40 memories, 80 recollections and 8 memories per area per session; duplicates from retried uploads are de-duplicated by a client id.
- **Retention:** sessions live **4 hours** by default, then rows and files are deleted (a periodic sweep plus on-request checks; also on restart). The host can end a session (link dies, data stays until expiry) or **delete all data** at any time. Deleting a memory removes its files and text immediately; it cannot remove screenshots people already took.
- **Headers:** `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`; path-traversal-safe static serving; request logging (off by default, `LOG_REQUESTS=1`) redacts tokens.

**This is not production-grade security.** There is no HTTPS, no login beyond capability links, rate limits are per process and in memory, and an attacker on the same network who gets the join link can submit (not approve) content. The server never claims otherwise.

---

## The garden

Four areas, eight plants each: **Everyday Moments**, **Celebrations**, **People We Cherish**, **Places We Remember**. Each memory plant has a framed photo card showing the photograph in its original proportions (letter-boxed on a cream mat, never stretched), a title plate and a gentle "open me" marker. Approved recollections add **one leaf each**; a plant's size and health never depend on how many responses it has, and nothing is ranked or scored.

**Optional gathering-place activity:** when the garden holds one *everyday* memory, one *celebration* and one *place*, a gathering place (tree, benches, lanterns) grows in the middle. It is recomputed from what exists, so it disappears if the memory it depends on is deleted. There is nothing to win or lose.

Each memory shows four **conversation prompts** to use at home or in a group: *What happened before this photo? Who is missing because they took it? What would someone younger not understand? Does anyone remember this differently?*

**Accessibility:** everything is reachable by keyboard and on-screen buttons; the host panel lists every memory with *Open* and *Walk there* buttons so no 3D picking is required; dialogs trap focus and restore it; live announcements for new memories; sound is **off** by default; *Reduced motion* follows the system setting and stops swaying/growth animation; no flashing, no timers; colours are soft (no neon).

---

## Project map

```
server/        index.js (start-up)  app.js (routes)  images.js  store.js  hub.js  config.js  util.js
server/web/    join.html join.css join.js   — the phone page (no build step)
src/           main.js  qr.js  settings.js  style.css
src/world/     garden.js (scene)  plant.js (memory plants)  kit.js  player.js  input.js  collision.js  config.js (layout)
src/garden/    state.js        src/net/live.js        src/data/content.js (all wording)
src/ui/        screens.js  host-dock.js  memory-panel.js  hud.js  dom.js
scripts/       server-test.mjs  garden-state-test.mjs  qr-check.py  dev.mjs  ui-harness/
docs/          WALKTHROUGH.md (3-minute demo script)  TEST_CHECKLIST.md (manual checks on real devices)
```

The movement, camera, collision, UI-overlay and rendering helpers come from the earlier prototype ("Our Block, Our Stories"); its missions, dialogue and archive logic were removed.

---

## Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Title screen says the server is "not reachable" | The server is not running. `npm run showcase` (or `npm start` after `npm run build`), and open the page from **that** address. |
| `Port 3000 is already in use` | Another program uses it. Close it or use `PORT=3100 npm start`. |
| QR code shows `localhost` / phone says "can't connect" | Use the host panel → *Change the address phones will use*. Make sure the laptop is on Wi-Fi/hotspot and pick its address. |
| Address is right but the phone still can't connect | Client isolation on the Wi-Fi (use a hotspot), different network, or the firewall blocks the port (allow Node.js on private networks / the port). |
| "HEIC photos are not supported" | On iPhone: Settings → Camera → Formats → *Most Compatible*, or share the photo as JPEG. |
| Photo rejected as too large | Default limit is 10 MB (phone shrinks big photos first). Raise `MAX_UPLOAD_MB`. |
| Upload fails halfway | The phone shows a retry button; retries are safe (no duplicates). |
| Nothing appears in the garden after Approve | Check the Connection chip (top left): *Reconnecting…* means the page lost the server — it resyncs automatically when it returns. If the session expired, start a new one. |
| "This area of the garden is full" | Each area holds 8 plants. Delete one in the Garden tab. |
| Scene too dark / too bright, or choppy | `LIGHT` in `src/world/config.js`; add `?low` to the address for lighter graphics; `?fps` shows a frame-rate read-out. |
| Blank page / "The garden could not start" | WebGL is disabled or unsupported (check browser hardware acceleration). |
| `node:sqlite` not found | Node is older than 22.13. Update Node. |
| `sharp` fails to install | Use a current Node LTS on a common platform; run `npm rebuild sharp`. |
| Want a clean slate | Stop the server, `npm run clear-data`. |

---

## Known limitations

- **Never rendered with real Three.js** (see *Honest status*). Visual polish, lighting values and camera framing are unverified.
- Optional mechanics from the brief — **arranging plants** and **linking related plants** — are **not implemented**; the basic plant-and-read loop, recollections and the gathering place are.
- Single laptop host; households in different places are out of scope. Max 40 memories / 8 per area per session.
- HEIC/HEIF/AVIF, GIF and SVG are refused; no video or audio.
- Recollections can be typed by the host or sent from a phone; they always need host approval. The host panel does not edit memories (delete and re-submit instead).
- Retention is "4 hours then deleted", not preservation. Storage is the server's disk, unencrypted.
- Prototype-grade security (above). No automated accessibility audit was run; only the checks listed in `docs/TEST_CHECKLIST.md` are suggested.
- Layout is desktop-first; the phone page is mobile-first. The garden itself is not designed for phone screens.
