# Manual test checklist

Tick each box on a real browser after `npm install && npm run dev`. (Automated: `npm test` covers game logic only.)

## Start-up
- [ ] Title screen shows, with "Singapore, 2040 — a proposed future"
- [ ] No red errors in the browser console
- [ ] The 3D scene is visible, readable and not too dark/bright (else edit `LIGHT`)
- [ ] Play → intro → Begin; world is controllable

## Movement and camera
- [ ] WASD and arrow keys move; Q/R/drag rotate; C re-centres
- [ ] Cannot walk through walls, furniture, the railing, or off the edge
- [ ] Camera never ends up inside a wall
- [ ] Esc pauses (no movement while paused); Esc again resumes
- [ ] Pause → "I'm stuck" returns to the void deck

## Dialogue
- [ ] E talks to people; the prompt shows only when close
- [ ] Every line shown as text; nothing advances by itself
- [ ] Keys 1–3 and Enter work; Esc leaves; movement works again afterward

## Mission 1
- [ ] Hear Lim and Mei; examine photo, pot, note
- [ ] Unverified detail is refused; two verified details attach
- [ ] Keeping only one recollection is refused; both is accepted
- [ ] Wrong sharing is explained and not saved; agreed sharing saves
- [ ] Record appears on the wall board; pressing Save twice doesn't double-count

## Mission 2
- [ ] Hear both neighbours; discover the old photo
- [ ] Single perspective and guessed date are gently refused
- [ ] "Date uncertain" and name preferences ("a neighbour") appear in the record
- [ ] Cannot save before context notes are chosen; a reason is shown

## Mission 3
- [ ] Wish card visible; "Matches her wish" badge on the family option
- [ ] Public and Do-not-save are explained kindly and do not complete
- [ ] Family-only completes; record is NOT on the wall board; IS in the Restricted tab

## Kiosk and archive
- [ ] Kiosk locked until three missions documented (if applicable); demo-only label shown
- [ ] Empty form shows errors; phone/email-like text is flagged
- [ ] Public / Family-only / Private draft each end up in exactly one place
- [ ] Changing audience or deleting in the journal updates the wall board immediately

## Ending
- [ ] Aisha's summary lists documented stories, preserved perspectives, privacy, contribution
- [ ] Quote is shown; Explore again / View the archive / Restart / About all work

## Persistence and reset
- [ ] Reload → Continue restores progress
- [ ] Pause → Reset demo (confirm) clears everything and returns to the intro
- [ ] Title → Reset progress clears play and presenter saves; sound/motion settings kept
- [ ] With site data blocked, a warning shows and the game still runs

## Presenter mode
- [ ] 0 of 3 documented at start; jump buttons land in the right rooms
- [ ] Staged missions are labelled "staged for demo" in HUD, records and summary
- [ ] Reset all missions returns to the ready state; Exit presenter returns to title
- [ ] Normal-play save is unaffected by presenter mode

## Accessibility
- [ ] Tab/Shift+Tab stay inside an open panel; focus rings visible
- [ ] Mute (M and buttons) works; Reduced motion stops bobbing/sway
- [ ] Window resize and 200% zoom stay usable
- [ ] `?low` address loads and runs without shadows
