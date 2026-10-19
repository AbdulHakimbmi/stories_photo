# Manual test checklist (real devices)

The automated tests cover the server, the phone page, the state logic and the UI flow with a stand-in for Three.js (see README → *Honest status*). **These are the checks that need a real screen, GPU and phone.** Tick them off before a showcase.

## 1. First look (laptop)
- [ ] `npm install` finishes; `npm run showcase` builds and prints a `localhost` and a network address.
- [ ] The title screen shows over a slowly moving view of the garden. No cyberpunk/neon look; colours soft.
- [ ] *Try the fictional demo*: three plants with pictures on their cards; text on signs is readable; nothing overlaps the paths; plants are clickable.
- [ ] Walk around (WASD + drag): no getting stuck on plants, benches, signs; **Back to the gate** in the Menu rescues you.
- [ ] **G** gives a clear view of all four beds; **G** again returns smoothly.
- [ ] Frame rate acceptable (add `?fps`). On a slow laptop try `?low`.
- [ ] Too dark/bright? Adjust `LIGHT` in `src/world/config.js`.

## 2. Live session
- [ ] *Start a live garden session*: QR appears; the text under it is a network address, **not** `localhost`.
- [ ] A phone camera scans the QR from ~1 m away on the laptop screen and from the *large QR* view.
- [ ] Phone: the page loads, shows the garden name and the privacy sentence.
- [ ] Phone (iPhone Safari): choose from Photos; a HEIC photo is either converted to JPEG by the browser or refused with the explanation.
- [ ] Phone (Android Chrome): choose from Gallery; a 5–8 MB camera photo uploads in reasonable time with a progress bar.
- [ ] Portrait and landscape photos both appear upright on the 3D card, not stretched.
- [ ] Laptop: badge/toast announces the waiting item; large preview is the right photo; **Approve** → plant grows without reload and shows the real photo.
- [ ] Phone's status changes to *On display*; *My contributions* lists it; *Withdraw* works and the plant disappears.
- [ ] Recollection from a phone (via the memory's QR) → approval → a leaf appears; the original story is untouched.
- [ ] *Do not display* hides a memory but keeps it under *Not displayed*; *Display again* restores it.
- [ ] *Delete* removes the plant; the photo URL stops working; `data/uploads/` loses the files.
- [ ] Pause uploads → phone shows the polite "paused" message. End session → phone shows "ended".
- [ ] Turn Wi-Fi off/on on the laptop: the chip says *Reconnecting…* then *Connected*; no duplicate plants.
- [ ] Restart the server while the page is open: *Resume saved session* works after reload; data survived.
- [ ] A friend on the same Wi-Fi who is **not** the host cannot open `/api/h/...` pages (they get 401) and cannot create a session from their device.

## 3. Gathering place and prompts
- [ ] Approve one everyday memory, one celebration and one place → "A gathering place has grown…" appears in the middle; benches/tree not blocking the paths.
- [ ] Delete one of them → the gathering place goes away.
- [ ] Each memory shows the four conversation prompts.

## 4. Accessibility and comfort
- [ ] Everything reachable with keyboard only (Tab, Enter, Esc; H, G, E, M keys). Focus is visible and returns after closing a panel.
- [ ] The host panel *Garden* tab opens any memory without 3D clicking.
- [ ] Reduced motion (system setting or Menu toggle) stops swaying and growth animation but still shows the result.
- [ ] Sound is off at start; **M** toggles it.
- [ ] Browser zoom 200%: panels scroll; nothing is cut off.
- [ ] Phone page: tap targets comfortable, text readable without zooming, no sideways scrolling.

## 5. Privacy
- [ ] Upload a photo with GPS (a camera photo): `exiftool` on the file in `data/uploads/<session>/` shows no GPS/camera data.
- [ ] Join URL, QR text, the browser address bar and server logs (`LOG_REQUESTS=1`) never contain the host token.
- [ ] After *Delete all session data* the join link says it is not valid and `data/uploads/` is empty.
