// =============================================================================
//  record-view.js — one memory record, shown the same way in the journal and the archive.
// =============================================================================
import { h } from './dom.js';
import { illustrationElement } from '../art/illustrations.js';

export const SHARING_CHIP = {
  public: 'Public neighbourhood archive',
  family: 'Family-only (demo restricted record)',
  draft: 'Private draft — not shared',
};

export function chip(text, kind = '') {
  return h('span', { class: `chip ${kind ? `chip--${kind}` : ''}` }, text);
}

export function recordView(record, { banner = null, headingLevel = 3 } = {}) {
  const Heading = `h${headingLevel}`;
  return h(
    'article',
    { class: 'record', 'aria-label': `Memory record: ${record.title}` },
    banner ? h('p', { class: 'banner banner--lock' }, banner) : null,
    illustrationElement(record.illus, { w: 480, h: 320, className: 'illus illus--record' }),
    h(Heading, { class: 'record__title', tabindex: '-1' }, record.title),
    h(
      'div',
      { class: 'chips' },
      chip(record.statusLabel, record.staged ? 'staged' : 'status'),
      chip(SHARING_CHIP[record.sharing] || record.sharing, record.sharing),
    ),
    h('dl', { class: 'facts' },
      h('dt', null, 'Contributors'), h('dd', null, record.contributors),
      h('dt', null, 'Date'), h('dd', null, record.dateLabel),
      h('dt', null, 'Sharing'), h('dd', null, record.sharingLabel),
    ),
    h('p', { class: 'record__story' }, record.story),
    record.perspectives && record.perspectives.length
      ? h('section', { 'aria-label': 'Perspectives' },
        h('h4', null, record.perspectives.length > 1 ? 'Perspectives kept side by side' : 'Perspective'),
        h('div', { class: 'persp' },
          record.perspectives.map((p) => h('figure', { class: 'persp__card' },
            h('blockquote', null, p.text),
            h('figcaption', null, `— ${p.who}`)))))
      : null,
    record.details && record.details.length
      ? h('section', { 'aria-label': 'Verified details' }, h('h4', null, 'Verified details'), h('ul', null, record.details.map((d) => h('li', null, d))))
      : null,
    record.notes && record.notes.length
      ? h('section', { 'aria-label': 'Context notes' }, h('h4', null, 'Context notes'), h('ul', null, record.notes.map((d) => h('li', null, d))))
      : null,
  );
}
