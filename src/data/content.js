// =============================================================================
//  content.js — all visible wording and the fictional demo memories.
//  Nothing here claims real statistics, policies, partnerships or research.
// =============================================================================
export const GAME_TITLE = 'Our Memory Garden';
export const SETTING_LINE = 'Singapore, 2040 — a proposed future experience.';
export const PROTOTYPE_NOTE = 'This prototype demonstrates shared contribution and storytelling. It is not a permanent digital preservation service.';
export const TEMP_STORAGE_NOTE = 'This is temporary showcase storage, not long-term preservation.';

export const AREAS = {
  everyday: { label: 'Everyday Moments', blurb: 'Small, ordinary moments that mattered', accent: 0xd8b04a, accentCss: '#d8b04a' },
  celebrations: { label: 'Celebrations', blurb: 'Gatherings, festivals, milestones', accent: 0xc8694a, accentCss: '#c8694a' },
  people: { label: 'People We Cherish', blurb: 'The people behind the photographs', accent: 0xc98a9a, accentCss: '#c98a9a' },
  places: { label: 'Places We Remember', blurb: 'Homes, streets and favourite corners', accent: 0x6f9fb5, accentCss: '#6f9fb5' },
};
export const AREA_IDS = ['everyday', 'celebrations', 'people', 'places'];

export const ACTIVITY = {
  title: 'Create a family gathering place',
  intro: 'Optional and cooperative: when the garden holds one everyday memory, one celebration and one place that matters, a gathering place grows in the middle. There are no scores.',
  needs: [
    { category: 'everyday', label: 'One everyday memory' },
    { category: 'celebrations', label: 'One celebration' },
    { category: 'places', label: 'One place that matters' },
  ],
  done: 'A gathering place has grown in the middle of the garden. It exists because people chose to share a memory, an occasion and a place. Nobody had to upload anything personal to see it: you can also use the fictional demo.',
};

export const CONVERSATION_PROMPTS = [
  'What happened before this photo?',
  'Who is missing because they took it?',
  'What would someone younger not understand?',
  'Does anyone remember this differently?',
];
export const RECOLLECTION_PROMPT = 'What do you remember about this moment?';

export const CONTROLS = [
  ['W A S D  /  Arrow keys', 'Walk around the garden'],
  ['Drag the mouse', 'Look around (Q / R also turn the camera, C re-centres it)'],
  ['Click a memory plant', 'Open its photograph and story'],
  ['E', 'Open the memory plant you are standing next to'],
  ['G', 'View the whole garden, or go back to walking'],
  ['H', 'Show or hide the host panel (live session)'],
  ['M', 'Mute or unmute sound (sound is off by default)'],
  ['Esc', 'Close the open panel, or pause'],
];

export const ABOUT_PARAGRAPHS = [
  'Our Memory Garden is a design prototype for a shared remembering ritual that connects families across different homes. It builds on a “Create a Memory Corner” kit, in which families chose meaningful photographs, used activity cards to prompt storytelling, and decorated a communal display that they returned to and added to over time.',
  'Here, real photographs sent from phones become plants in a shared garden. Others can add their own recollections beside the original story, and every contributor keeps a say: nothing appears until the host approves it, and anyone can withdraw what they shared.',
  'The garden is an interaction metaphor. It does not reconstruct historical events accurately, and it makes no claim of partnership with any organisation.',
];
export const ABOUT_HOW = [
  'The laptop shows a QR code. A phone opens a web page served by the same program, picks a photo, and uploads it over your local network.',
  'The server checks and re-encodes the photo, strips its metadata, and holds it in a host approval queue. Only approved memories are sent to the garden.',
  'Everything is temporary: a session expires automatically, and the host can end it or delete its data at any time.',
];
export const ABOUT_LIMITS = [
  'Prototype security only: it is designed for a trusted local network and a short demonstration, not for the open internet.',
  'Removing a memory deletes the stored copy on the server. It cannot undo screenshots or copies that viewers have already made.',
  'Phones and the laptop normally need to be on the same reachable network. Some campus and guest Wi-Fi networks block devices from reaching each other.',
  TEMP_STORAGE_NOTE,
];

export const PRIVACY_NOTICE = 'Your photo and story will be visible to people viewing this session after host approval.';

// ---------------------------------------------------------------------------
//  Fictional demo memories (drawn in code, shown only in the separate demo mode).
// ---------------------------------------------------------------------------
export const DEMO_MEMORIES = [
  {
    id: 'demo-market', fictional: true, illus: 'market', category: 'everyday', slot: 1,
    title: 'Saturday morning market', name: 'A fictional contributor', year: null, yearUnknown: true,
    story: 'A made-up memory for the demo: every Saturday, a grandparent and child walked to the same market stall, and the child was allowed to choose one fruit.',
    responses: [{ id: 'demo-market-r1', name: 'Another fictional voice', text: 'In this invented version, the fruit was always a papaya that nobody else liked.' }],
  },
  {
    id: 'demo-dinner', fictional: true, illus: 'dinner', category: 'people', slot: 2,
    title: 'Dinner at Ah Ma’s table', name: 'A fictional contributor', year: 1998, yearUnknown: false,
    story: 'A made-up memory for the demo: everyone squeezed around a round table, and the youngest relative was given the job of counting the bowls.',
    responses: [],
  },
  {
    id: 'demo-doorway', fictional: true, illus: 'doorway', category: 'celebrations', slot: 0,
    title: 'The doorway at New Year', name: 'A fictional contributor', year: null, yearUnknown: true,
    story: 'A made-up memory for the demo: lanterns above the door, a pile of shoes outside, and a neighbour who always arrived with oranges.',
    responses: [],
  },
];
/** Planted by the “Plant the next fictional memory” button, so the demo can show a gathering place appearing. */
export const DEMO_NEXT = [
  {
    id: 'demo-kites', fictional: true, illus: 'kites', category: 'places', slot: 3,
    title: 'The field behind the block', name: 'A fictional contributor', year: null, yearUnknown: true,
    story: 'A made-up memory for the demo: an open field where kites were flown on windy afternoons, long before anyone owned a phone.',
    responses: [],
  },
];

/** Accessible descriptions for the fictional demo pictures (drawn in code, see art/illustrations.js). */
export const ILLUSTRATIONS = {
  dinner: { label: 'A family dinner around a round table' },
  market: { label: 'A morning market stall with an awning and fruit' },
  kites: { label: 'A child flying a kite on an open field' },
  doorway: { label: 'A festive doorway with lanterns and shoes outside' },
};
