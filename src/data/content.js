// =============================================================================
//  content.js — ALL story content lives here (no Three.js, no DOM).
//  Everything in this file is FICTIONAL. Characters, places and stories are
//  invented for a speculative design assignment. They are not interview findings.
// =============================================================================

export const GAME_TITLE = 'Our Block, Our Stories';
export const SETTING_LINE = 'Singapore, 2040 — a proposed future';
export const BLOCK_NAME = 'Block 12 (fictional)';

// ---------------------------------------------------------------------------
//  Missions (metadata used by HUD, journal and presenter mode)
// ---------------------------------------------------------------------------
export const MISSIONS = {
  m1: {
    id: 'm1',
    title: 'The Dinner Everyone Remembers',
    place: 'The Lim family home',
    where: 'the open door along the corridor',
  },
  m2: {
    id: 'm2',
    title: 'The Corridor Gathering',
    place: 'The shared corridor',
    where: 'the bench in the middle of the corridor',
  },
  m3: {
    id: 'm3',
    title: 'A Memory Worth Keeping Private',
    place: 'The quiet corner',
    where: 'the quiet corner at the far end of the corridor',
  },
};
export const MISSION_IDS = ['m1', 'm2', 'm3'];

// ---------------------------------------------------------------------------
//  Audiences (consent choices). These SIMULATE how the proposed service would
//  behave. No real access control exists in this prototype.
// ---------------------------------------------------------------------------
export const AUDIENCES = {
  public: {
    id: 'public',
    label: 'Public neighbourhood archive',
    short: 'Public',
    help: 'Appears on the communal memory board in the void deck.',
  },
  family: {
    id: 'family',
    label: 'Selected family members only',
    short: 'Family-only',
    help: 'Listed only in the demo restricted-record list. Never shown on the public board.',
  },
  draft: {
    id: 'draft',
    label: 'Private draft (keep in my journal)',
    short: 'Private draft',
    help: 'Stays in your journal. Not on the board and not in the restricted list.',
  },
};
export const AUDIENCE_IDS = ['public', 'family', 'draft'];

// ---------------------------------------------------------------------------
//  Illustration metadata (the drawings themselves are generated in art/illustrations.js)
// ---------------------------------------------------------------------------
export const ILLUSTRATIONS = {
  dinner: { label: 'A family dinner around a round table', sample: false },
  corridor: { label: 'A gathering in a shared corridor with lanterns and plants', sample: false },
  kueh: { label: 'A child and an older woman making kueh in a kitchen', sample: false },
  pot: { label: 'A dented rice pot with a dark crust at the bottom', sample: false },
  note: { label: 'A handwritten note on lined paper', sample: false },
  market: { label: 'A morning market stall with an awning and fruit', sample: true },
  kites: { label: 'A child flying a kite on an open field', sample: true },
  doorway: { label: 'A festive doorway with lanterns and shoes outside', sample: true },
};
export const SAMPLE_ILLUS = [
  { key: 'market', label: 'Morning market stall' },
  { key: 'kites', label: 'Kite on the field' },
  { key: 'doorway', label: 'Festive doorway' },
];

// ---------------------------------------------------------------------------
//  Mission 1 — details the player can attach. Only VERIFIED details may be attached.
// ---------------------------------------------------------------------------
export const M1_DETAILS = [
  {
    id: 'table',
    text: 'Six places were set at one round table.',
    source: 'Seen in the photograph',
    verified: true,
    needs: (p) => p.m1.photo,
    needsHint: 'Examine the photograph first.',
  },
  {
    id: 'burnt',
    text: 'The rice burnt, and the pot had to be scraped afterwards.',
    source: 'Told by Uncle Lim',
    verified: true,
    needs: (p) => p.m1.spokeLim,
    needsHint: 'Ask Uncle Lim about the dinner.',
  },
  {
    id: 'late',
    text: 'Everyone stayed late at the table, talking.',
    source: 'Told by Mei',
    verified: true,
    needs: (p) => p.m1.spokeMei,
    needsHint: 'Ask Mei what she remembers.',
  },
  {
    id: 'note',
    text: 'A handwritten note asks Mei to bring the good bowls for the first dinner back together.',
    source: 'The handwritten note',
    verified: true,
    needs: (p) => p.m1.note,
    needsHint: 'Look at the handwritten note.',
  },
  {
    id: 'birthday',
    text: 'It was probably a birthday dinner.',
    source: 'A guess from the photo — nobody confirmed this',
    verified: false,
    needs: (p) => p.m1.photo,
    needsHint: 'Examine the photograph first.',
  },
];
export const M1_VERIFIED_NEEDED = 2;

// ---------------------------------------------------------------------------
//  Mission 2 — context notes
// ---------------------------------------------------------------------------
export const M2_NOTES = [
  {
    id: 'place',
    text: 'Place: the shared corridor outside the lifts, Block 12 (fictional).',
    needs: (p) => p.m2.photo,
    needsHint: 'Find the old photograph first.',
  },
  {
    id: 'devi',
    text: 'Madam Devi remembers food laid along the corridor, paper lanterns and music.',
    needs: (p) => p.m2.spokeDevi,
    needsHint: 'Hear Madam Devi’s account first.',
  },
  {
    id: 'rahman',
    text: 'Mr Rahman remembers neighbours bringing meals and sitting with a family who had lost someone.',
    needs: (p) => p.m2.spokeRahman,
    needsHint: 'Hear Mr Rahman’s account first.',
  },
  {
    id: 'both',
    text: 'Both remember a crowded corridor and many neighbours turning up.',
    needs: (p) => p.m2.spokeDevi && p.m2.spokeRahman,
    needsHint: 'Hear both accounts first.',
  },
];
export const M2_NOTES_NEEDED = 2;

// ---------------------------------------------------------------------------
//  Static parts of the mission records (the dynamic parts are assembled in logic.js)
// ---------------------------------------------------------------------------
export const RECORD_TEXT = {
  m1: {
    title: 'The Dinner Everyone Remembers',
    illus: 'dinner',
    story:
      'A photograph of a family dinner around a round table. On its own it looks like an ordinary meal. The family explains that it was their first dinner together after a difficult period apart.',
    perspectives: [
      { who: 'Lim', text: 'I burnt the rice! The pot was black at the bottom. We ate it anyway, and everyone laughed.' },
      { who: 'Mei', text: 'Nobody wanted to leave. We stayed at the table talking until the corridor lights switched off.' },
    ],
    dateLabel: 'Date not recorded',
    contributors: 'Lim and Mei (first names only; no address shown)',
    sharingNote: 'Shared on the neighbourhood board, as agreed by Lim and Mei.',
  },
  m2: {
    title: 'The Corridor Gathering',
    illus: 'corridor',
    story:
      'An old photograph of a gathering in the shared corridor. Two neighbours remember it differently: one as a celebration, the other as neighbours supporting a family through a difficult time. They are describing different aspects of the same day.',
    dateLabel: 'Date uncertain — neither neighbour could confirm it, so none is given',
    sharingNote: 'Shared on the neighbourhood board, with each neighbour’s chosen name display.',
  },
  m3: {
    title: 'Learning Kueh in Mum’s Kitchen',
    illus: 'kueh',
    story:
      'A personal family photograph of a child learning to make kueh beside her mother, in a kitchen that no longer exists. The contributor wants it kept for selected relatives only.',
    dateLabel: 'Many years ago (year not recorded)',
    contributors: 'Auntie Salmah',
    sharingNote: 'Family-only, as Auntie Salmah asked. It is not shown on the public board.',
  },
};

// ---------------------------------------------------------------------------
//  Items the player can examine
// ---------------------------------------------------------------------------
export const EXAMINE = {
  m1_photo: {
    title: 'Photograph: a family dinner',
    illus: 'dinner',
    flag: ['m1', 'photo'],
    seenText:
      'What you can see: six people around a round table, bowls and a pot in the middle, a lamp overhead. Everyone is smiling.',
    missingText:
      'What the photograph cannot tell you: who these people are, why they are together, what happened before this evening, or why it mattered. For that, you need to talk to the people who were there.',
    backText: 'Back of the photograph: blank. No date, no names, no caption.',
  },
  m1_pot: {
    title: 'A dented rice pot',
    illus: 'pot',
    flag: ['m1', 'pot'],
    seenText: 'A dented steel pot with a dark crust scraped away from the bottom. Rice once stuck here badly.',
    missingText: 'The pot alone does not say when, or why anyone kept it.',
    backText: null,
  },
  m1_note: {
    title: 'A handwritten note',
    illus: 'note',
    flag: ['m1', 'note'],
    seenText:
      'The note reads: “Mei — bring the good bowls. First dinner with everyone back at the table. Don’t be late! — Papa”',
    missingText: 'It is not dated. It suggests the dinner mattered, but not why.',
    backText: null,
  },
  m2_photo: {
    title: 'An old photograph on the corridor wall',
    illus: 'corridor',
    flag: ['m2', 'photo'],
    seenText:
      'What you can see: many neighbours in this very corridor, paper lanterns overhead, plates laid along a bench, plants along the railing.',
    missingText:
      'What the photograph cannot tell you: the date, the occasion, or who is in it. Nothing is written on the back.',
    backText: 'Back of the photograph: blank. No date, no names, no caption.',
  },
};

// ---------------------------------------------------------------------------
//  Dialogue trees
//   node: { speaker, text | (p)=>text, next, choices, effect, illus, consent, end }
//   choice: { label, next, effect, seen:(p)=>bool, badge }
//   effect receives the actions object (see logic.js); text/seen receive progress.
//   No node auto-advances. The player presses Next or picks a choice.
// ---------------------------------------------------------------------------
const AISHA = 'Aisha';

export const DIALOGUES = {
  // ---------------------------------------------------------------- Aisha
  aisha_intro: {
    start: 'a1',
    nodes: {
      a1: {
        speaker: AISHA,
        text: 'Marcus — you made it. Welcome to the community memory session at Block 12. I’m Aisha, the neighbourhood coordinator.',
        next: 'a2',
      },
      a2: {
        speaker: AISHA,
        text: 'Here is the idea behind our memory service: neighbours bring photographs, objects and stories, and we keep them together — with context, and only as widely as each person agrees.',
        next: 'a3',
      },
      a3: {
        speaker: AISHA,
        text: 'Before the session starts, I’d like three memories documented. A photo on its own isn’t enough. We need the story, who remembers it, and who is happy for it to be shared.',
        effect: (a) => a.briefed(),
        choices: [
          { label: 'Where should I start?', next: 'a4' },
          { label: 'Anything I should keep in mind?', next: 'a5' },
        ],
      },
      a4: {
        speaker: AISHA,
        text: 'Three households are expecting you. The Lim family has their door open along the corridor. Madam Devi and Mr Rahman are chatting by the corridor bench. And Auntie Salmah is resting at the quiet corner at the far end. Any order is fine.',
        choices: [
          { label: 'Anything I should keep in mind?', next: 'a5' },
          { label: 'Got it. I’ll get started.', next: null },
        ],
      },
      a5: {
        speaker: AISHA,
        text: 'Listen first. Different people can remember the same moment differently — that’s not a problem to fix. And sharing is always their decision, not ours. Press J any time to open your memory journal.',
        choices: [
          { label: 'Where should I start?', next: 'a4' },
          { label: 'Got it. I’ll get started.', next: null },
        ],
      },
    },
  },

  aisha_hub: {
    start: 'h1',
    nodes: {
      h1: {
        speaker: AISHA,
        text: (p) => {
          const done = ['m1', 'm2', 'm3'].filter((m) => p[m].done).length;
          return done === 0
            ? 'No stories documented yet — that’s fine. Take your time. Nobody is waiting on a clock.'
            : `${done} of 3 stories documented so far. Thank you, Marcus — take whatever time you need.`;
        },
        choices: [
          { label: 'Where should I go next?', next: 'h2' },
          { label: 'How does the journal work?', next: 'h3' },
          { label: 'Back to it.', next: null },
        ],
      },
      h2: { speaker: AISHA, text: (p, helpers) => helpers.objective(p), next: 'h1' },
      h3: {
        speaker: AISHA,
        text: 'Open it with J. Each memory has a few steps: confirm details you can trust, keep every account, and set who can see it. Nothing goes on the board until it has been documented.',
        next: 'h1',
      },
    },
  },

  aisha_kiosk: {
    start: 'k1',
    nodes: {
      k1: {
        speaker: AISHA,
        text: 'Three stories documented — thank you. One last thing: the kiosk next to the board lets you add a sample memory of your own. It’s fictional, for the demo. You decide who can see it.',
        next: 'k2',
      },
      k2: {
        speaker: AISHA,
        text: 'Come back and see me when you’re done.',
        choices: [{ label: 'Will do.', next: null }],
      },
    },
  },

  aisha_end: {
    start: 'e1',
    nodes: {
      e1: {
        speaker: AISHA,
        text: 'You added your own memory, and you chose where it goes. That’s the whole idea: the neighbourhood keeps the story, but the person who owns it keeps the choice.',
        next: 'e2',
      },
      e2: {
        speaker: AISHA,
        text: 'Let’s look back at what we kept today.',
        effect: (a) => a.endingSeen(),
        end: 'summary',
      },
    },
  },

  hint_unbriefed: {
    start: 'u1',
    nodes: {
      u1: {
        speaker: 'Marcus',
        text: 'I should check in with Aisha at the void deck before I start knocking on doors.',
        choices: [{ label: 'Okay.', next: null }],
      },
    },
  },

  // ---------------------------------------------------------------- Mission 1
  lim: {
    start: 'hub',
    nodes: {
      hub: {
        speaker: 'Uncle Lim',
        text: 'Marcus! Come in, come in. That photograph on the sideboard is from our table. Ask me anything — though I warn you, I’m not proud of the rice.',
        choices: [
          { label: 'Tell me about this dinner.', next: 'dinner', seen: (p) => p.m1.spokeLim },
          { label: 'Is that the pot from that night?', next: 'pot' },
          { label: 'Would you be happy for this to be shared?', next: 'consent', seen: (p) => p.m1.limConsent },
        ],
      },
      dinner: {
        speaker: 'Uncle Lim',
        text: 'That was our first dinner all together after a long, difficult stretch apart. I cooked — and I burnt the rice! Black at the bottom of the pot. We ate it anyway. That’s what I remember: the burnt rice, and everyone laughing about it.',
        effect: (a) => a.flag('m1', 'spokeLim'),
        next: 'hub',
      },
      pot: {
        speaker: 'Uncle Lim',
        text: 'Yes, that’s the pot. I scraped it for twenty minutes the next morning. Mei still teases me about it. You can see the dent on the table, if you look.',
        next: 'hub',
      },
      consent: {
        speaker: 'Uncle Lim',
        text: 'If it helps other families remember their own evenings, then yes — share it on the neighbourhood board. But please leave my address off, and use my first name only.',
        effect: (a) => a.flag('m1', 'limConsent'),
        next: 'hub',
      },
    },
  },

  mei: {
    start: 'hub',
    nodes: {
      hub: {
        speaker: 'Mei',
        text: 'Hi Marcus! Dad’s told you about the rice, hasn’t he? It’s the first thing he always says.',
        choices: [
          { label: 'What do you remember?', next: 'mem', seen: (p) => p.m1.spokeMei },
          { label: 'Do you two remember it differently?', next: 'diff' },
          { label: 'Are you happy for this to be shared?', next: 'consent', seen: (p) => p.m1.meiConsent },
        ],
      },
      mem: {
        speaker: 'Mei',
        text: 'Honestly, I remember the talking. After the meal nobody moved. We sat there until the corridor lights clicked off, telling each other things we hadn’t been able to say for months. The rice barely matters to me.',
        effect: (a) => a.flag('m1', 'spokeMei'),
        next: 'hub',
      },
      diff: {
        speaker: 'Mei',
        text: 'A little, yes. Dad remembers the burnt rice. I remember that we stayed late. I don’t think either of us is wrong — we’re each holding a different part of the same night.',
        next: 'hub',
      },
      consent: {
        speaker: 'Mei',
        text: 'Yes, the neighbourhood board is fine with me too. First names only, please.',
        effect: (a) => a.flag('m1', 'meiConsent'),
        next: 'hub',
      },
    },
  },

  // ---------------------------------------------------------------- Mission 2
  devi: {
    start: 'hub',
    nodes: {
      hub: {
        speaker: 'Madam Devi',
        text: 'Oh, you’ve found the old photograph on the wall! Come, stand here by the bench.',
        choices: [
          { label: 'What do you remember about that day?', next: 'mem', seen: (p) => p.m2.spokeDevi },
          { label: 'Do you remember when it was?', next: 'date' },
          { label: 'Would you like your name shown?', next: 'name', seen: (p) => !!p.m2.deviName },
        ],
      },
      mem: {
        speaker: 'Madam Devi',
        text: 'A celebration! Everyone brought a dish and lined them along the corridor. The children ran up and down with paper lanterns, somebody’s radio was playing, and we danced a little. I still smile every time I walk past this spot.',
        effect: (a) => a.flag('m2', 'spokeDevi'),
        next: 'hub',
      },
      date: {
        speaker: 'Madam Devi',
        text: 'Oh, when was it… before the lifts were upgraded, I think? Mr Rahman might remember better. I couldn’t give you a real date, I’m afraid.',
        next: 'hub',
      },
      name: {
        speaker: 'Madam Devi',
        text: 'Yes, put my name — “Madam Devi” is fine. And yes, the neighbourhood board is fine for me.',
        effect: (a) => a.setName('devi', 'show'),
        next: 'hub',
      },
    },
  },

  rahman: {
    start: 'hub',
    nodes: {
      hub: {
        speaker: 'Mr Rahman',
        text: 'Ah, that photograph. I remember that day too — though maybe not quite the way Madam Devi does.',
        choices: [
          { label: 'What do you remember about that day?', next: 'mem', seen: (p) => p.m2.spokeRahman },
          { label: 'Do you remember when it was?', next: 'date' },
          { label: 'Would you like your name shown?', next: 'name', seen: (p) => !!p.m2.rahmanName },
        ],
      },
      mem: {
        speaker: 'Mr Rahman',
        text: 'For me it was the day the corridor looked after a family. A neighbour had lost someone close. People came with food, sat with them, took turns minding the little ones. Yes, there was food and music — but what I remember is people showing up.',
        effect: (a) => a.flag('m2', 'spokeRahman'),
        next: 'mem2',
      },
      mem2: {
        speaker: 'Mr Rahman',
        text: 'Madam Devi remembers the celebration, and that was real too. I think we’re describing different sides of the same day.',
        next: 'hub',
      },
      date: {
        speaker: 'Mr Rahman',
        text: 'Hmm. After a monsoon season… a year or two before my knee operation? I wouldn’t swear to it. Please don’t write down a date I can’t stand behind.',
        next: 'hub',
      },
      name: {
        speaker: 'Mr Rahman',
        text: 'You may share it on the board — but please write “a neighbour” instead of my name.',
        effect: (a) => a.setName('rahman', 'anonymous'),
        next: 'hub',
      },
    },
  },

  // ---------------------------------------------------------------- Mission 3
  salmah: {
    start: 's1',
    nodes: {
      s1: {
        speaker: 'Auntie Salmah',
        text: 'Marcus? Sit, sit. Aisha said you would come. I have been looking at this photograph again.',
        illus: 'kueh',
        next: 's2',
      },
      s2: {
        speaker: 'Auntie Salmah',
        text: 'It is the only picture I have of my mother and me in her kitchen. I was about nine. She was teaching me to make kueh. That kitchen is gone now — the whole building was rebuilt.',
        illus: 'kueh',
        effect: (a) => a.flag('m3', 'spoke'),
        next: 's3',
      },
      s3: {
        speaker: 'Auntie Salmah',
        text: 'My mother was a very private person. She never liked her picture taken. I want her remembered, but not looked at by strangers.',
        illus: 'kueh',
        effect: (a) => a.flag('m3', 'wishHeard'),
        next: 'choose',
      },
      choose: {
        speaker: 'Auntie Salmah',
        text: 'I would like this kept for my children and my cousins, and for nobody else. How would you like to keep it, Marcus?',
        illus: 'kueh',
        consent: {
          title: 'Auntie Salmah’s wish',
          body: 'Keep for selected relatives only. Not on the public board.',
        },
        choices: [
          { label: 'Public neighbourhood archive', next: 'public', effect: (a) => a.m3Try('public') },
          { label: 'Selected family members', next: 'family', effect: (a) => a.m3Try('family'), badge: 'Matches her wish' },
          { label: 'Do not save', next: 'nosave', effect: (a) => a.m3Try('nosave') },
        ],
      },
      public: {
        speaker: 'Auntie Salmah',
        text: 'Oh… I would rather my mother was not on a public board. Could we keep it just for my family? I’m not upset — I only want to say what I prefer.',
        consent: {
          title: 'Auntie Salmah’s wish',
          body: 'Keep for selected relatives only. Not on the public board.',
        },
        next: 'choose',
      },
      nosave: {
        speaker: 'Auntie Salmah',
        text: 'That is kind of you, but I do want it kept — for my children. Not saving it would mean losing her kitchen completely. Could you keep it for family only?',
        consent: {
          title: 'Auntie Salmah’s wish',
          body: 'Keep for selected relatives only. Not on the public board.',
        },
        next: 'choose',
      },
      family: {
        speaker: 'Auntie Salmah',
        text: 'Thank you, Marcus. Selected relatives only — that is exactly what I hoped for. She stays kept, and she stays ours.',
        end: null,
      },
    },
  },

  salmah_done: {
    start: 'd1',
    nodes: {
      d1: {
        speaker: 'Auntie Salmah',
        text: 'Thank you again. It feels good to know she is kept safe, and that I decided how.',
        choices: [{ label: 'You’re welcome, Auntie.', next: null }],
      },
    },
  },
};

// ---------------------------------------------------------------------------
//  Long-form copy for About / Controls / Intro / Ending
// ---------------------------------------------------------------------------
export const INTRO_PARAGRAPHS = [
  'In this proposed future, neighbours can keep everyday memories together as a community responsibility — not only inside individual families.',
  'A neighbourhood memory service helps residents contribute photographs, objects and stories. Different recollections can sit side by side. Each contributor decides how widely their memory is shared, and younger residents help keep everyday heritage alive.',
];
export const FICTION_NOTICE =
  'All characters, places and stories in this prototype are fictional. Nothing here is an interview finding, an existing programme or a real policy.';

export const ABOUT_PARAGRAPHS = [
  'Our Block, Our Stories is a speculative design prototype made for a university assignment. It extends a “Create a Memory Corner” activity kit — where families chose printed photographs, talked about the stories behind them and arranged them at home — into a possible future.',
  'The proposed future: Singapore in 2040, where preserving everyday memories can be a community responsibility rather than something each family must do alone. This is a proposal, not an existing government programme. No agency or institution has endorsed it, and it uses no statistics or research findings.',
  'What the prototype tries to show: a photograph needs context to stay meaningful; different people can remember the same event differently; keeping a memory is not the same as making it public; and residents can actively add to a shared neighbourhood history.',
];
export const SIMULATED_POINTS = [
  'Audience settings (public, family-only, private draft) SIMULATE how the proposed service would work. There is no real access control and no accounts.',
  'Nothing is uploaded or sent anywhere. Progress is kept in this browser’s local storage for the demo only — it is not secure archival storage.',
  'The photographs are original illustrations drawn in code. They are not real people or real photos.',
];

export const CONTROLS = [
  ['W A S D  /  Arrow keys', 'Move'],
  ['Drag with mouse or touch', 'Rotate camera'],
  ['Q / R', 'Rotate camera with the keyboard (C re-centres it)'],
  ['E', 'Interact with the highlighted person or object'],
  ['J', 'Open or close your memory journal'],
  ['M', 'Mute or unmute sound'],
  ['Esc', 'Pause, or close the open panel'],
  ['1 – 3 / Enter', 'Choose a dialogue option / continue'],
];

export const ENDING_QUOTE = ['A neighbourhood’s history is made of ordinary lives.', 'What story would you help keep?'];
