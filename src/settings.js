// settings.js — the few per-browser preferences (sound off by default; reduced motion follows the system setting).
const KEY = 'ourMemoryGarden.settings.v1';

export function loadSettings() {
  const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const s = { muted: true, reducedMotion: prefersReduced };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') {
      if (typeof v.muted === 'boolean') s.muted = v.muted;
      if (typeof v.reducedMotion === 'boolean') s.reducedMotion = v.reducedMotion;
    }
  } catch { /* storage unavailable: defaults are fine */ }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ muted: !!s.muted, reducedMotion: !!s.reducedMotion })); } catch { /* ignore */ }
}
