"""Decodes the project's own QR codes with OpenCV, as an independent check of src/qr.js.
Run:  python3 scripts/qr-check.py     (needs python3 with opencv-python and numpy; optional, not part of npm test)"""
import json, subprocess, sys
import numpy as np, cv2

out = subprocess.run(["node", "scripts/qr-dump.mjs"], capture_output=True, text=True, check=True).stdout
samples = json.loads(out)
det = cv2.QRCodeDetector()
bad = 0
for s in samples:
    m = np.array(s["matrix"], dtype=np.uint8)
    img = np.where(m == 1, 0, 255).astype(np.uint8)
    img = np.pad(img, 4, constant_values=255)
    img = cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    text, _, _ = det.detectAndDecode(img)
    ok = text == s["text"]
    if not ok:
        bad += 1
    print(("ok  " if ok else "FAIL"), s["level"], "len", len(s["text"]), "version", (len(m) - 17) // 4)
print("all decoded correctly" if bad == 0 else f"{bad} failures")
sys.exit(1 if bad else 0)
