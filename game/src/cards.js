// cards.js — every card in Tidebound Duel: its cost, its body and what it does.
//
// Four tides, each with its own colour AND its own shape, so a card is never
// identified by text alone:
//   coral  — warm red-pink, drawn as a shell
//   deep   — ocean blue, drawn as a wave
//   storm  — violet-gold, drawn as a lightning bolt
//   kelp   — sea green, drawn as a leaf
//
// Keywords:
//   Guard    — enemy creatures must attack this one first.
//   Swift    — may attack on the turn it is played.
//   Drain    — damage this creature deals also heals its duelist.
//   Tidebond — +1 attack / +1 health while another creature of the same
//              tide stands beside it.

const TIDES = {
  coral: { name: 'Coral', color: '#e85d75', dark: '#a63a4e', light: '#ffd9de', shape: 'shell' },
  deep: { name: 'Deep', color: '#3f8fd2', dark: '#245b8f', light: '#d3e9fb', shape: 'wave' },
  storm: { name: 'Storm', color: '#8a5fd0', dark: '#5a3691', light: '#e6dcf8', shape: 'bolt' },
  kelp: { name: 'Kelp', color: '#3da56b', dark: '#226b42', light: '#d2f2dd', shape: 'leaf' },
};

// One entry per card. `kind` is 'creature' or 'spell'.
// Creatures carry attack / health. Spells carry an `effect` id that
// state.js knows how to resolve, plus a `power` number where one fits.
const CARD_DEFS = [
  // ---- 1-cost creatures: early board, cheap Tidebond pieces ----
  { id: 'reef-pup', name: 'Reef Pup', kind: 'creature', cost: 1, attack: 1, health: 2, tide: 'kelp', text: 'Tidebond' },
  { id: 'foam-sprite', name: 'Foam Sprite', kind: 'creature', cost: 1, attack: 2, health: 1, tide: 'deep', text: 'Swift' },
  { id: 'ember-crab', name: 'Ember Crab', kind: 'creature', cost: 1, attack: 1, health: 3, tide: 'coral', text: 'Guard' },

  // ---- 2-cost creatures: the workhorses ----
  { id: 'tide-runner', name: 'Tide Runner', kind: 'creature', cost: 2, attack: 2, health: 3, tide: 'deep', text: 'Tidebond' },
  { id: 'shell-squire', name: 'Shell Squire', kind: 'creature', cost: 2, attack: 2, health: 4, tide: 'coral', text: 'Guard' },
  { id: 'kelp-dancer', name: 'Kelp Dancer', kind: 'creature', cost: 2, attack: 3, health: 2, tide: 'kelp', text: 'Swift' },
  { id: 'spark-eel', name: 'Spark Eel', kind: 'creature', cost: 2, attack: 3, health: 2, tide: 'storm', text: 'Drain' },

  // ---- 3-cost creatures: board presence ----
  { id: 'coral-knight', name: 'Coral Knight', kind: 'creature', cost: 3, attack: 3, health: 5, tide: 'coral', text: 'Guard' },
  { id: 'abyss-jelly', name: 'Abyss Jelly', kind: 'creature', cost: 3, attack: 4, health: 3, tide: 'deep', text: 'Drain' },
  { id: 'storm-heron', name: 'Storm Heron', kind: 'creature', cost: 3, attack: 4, health: 4, tide: 'storm', text: 'Swift' },
  { id: 'grove-turtle', name: 'Grove Turtle', kind: 'creature', cost: 3, attack: 2, health: 7, tide: 'kelp', text: 'Guard · Tidebond' },

  // ---- 4+ cost creatures: finishers ----
  { id: 'leviathan-calf', name: 'Leviathan Calf', kind: 'creature', cost: 4, attack: 5, health: 5, tide: 'deep', text: 'Tidebond' },
  { id: 'tempest-drake', name: 'Tempest Drake', kind: 'creature', cost: 5, attack: 6, health: 6, tide: 'storm', text: 'Swift · Drain' },
  { id: 'reef-titan', name: 'Reef Titan', kind: 'creature', cost: 6, attack: 7, health: 8, tide: 'coral', text: 'Guard' },
  { id: 'mother-of-tides', name: 'Mother of Tides', kind: 'creature', cost: 7, attack: 8, health: 8, tide: 'kelp', text: 'Tidebond · Drain' },

  // ---- Spells: the second way to combine a hand ----
  { id: 'coral-mend', name: 'Coral Mend', kind: 'spell', cost: 2, tide: 'coral', effect: 'heal', power: 6, text: 'Restore 6 life to your duelist.' },
  { id: 'riptide-blast', name: 'Riptide Blast', kind: 'spell', cost: 2, tide: 'deep', effect: 'damage', power: 3, text: 'Deal 3 damage to any target.' },
  { id: 'storm-surge', name: 'Storm Surge', kind: 'spell', cost: 3, tide: 'storm', effect: 'sweep', power: 1, text: 'Deal 1 damage to every enemy creature.' },
  { id: 'tide-draw', name: 'Tide Draw', kind: 'spell', cost: 2, tide: 'kelp', effect: 'draw', power: 2, text: 'Draw 2 cards.' },
  { id: 'surge-blessing', name: 'Surge Blessing', kind: 'spell', cost: 2, tide: 'coral', effect: 'buff', power: 2, text: 'Give a friendly creature +2 / +2.' },
  { id: 'undertow', name: 'Undertow', kind: 'spell', cost: 3, tide: 'deep', effect: 'bounce', power: 0, text: 'Return an enemy creature to its hand.' },
];

// The deck every duelist shuffles: two copies of the cheap cards, one of
// the big ones, so early turns are busy and late turns are swingy.
function buildDeck() {
  const counts = {
    'reef-pup': 2, 'foam-sprite': 2, 'ember-crab': 2,
    'tide-runner': 2, 'shell-squire': 2, 'kelp-dancer': 2, 'spark-eel': 2,
    'coral-knight': 2, 'abyss-jelly': 2, 'storm-heron': 1, 'grove-turtle': 1,
    'leviathan-calf': 1, 'tempest-drake': 1, 'reef-titan': 1, 'mother-of-tides': 1,
    'coral-mend': 2, 'riptide-blast': 2, 'storm-surge': 1, 'tide-draw': 2,
    'surge-blessing': 2, 'undertow': 1,
  };
  const deck = [];
  for (const def of CARD_DEFS) {
    const n = counts[def.id] || 0;
    for (let i = 0; i < n; i++) deck.push(def.id);
  }
  return deck;
}

function cardDef(id) {
  return CARD_DEFS.find((d) => d.id === id);
}

// A live card on a board or in a hand: a definition plus its current body.
function makeCard(id, uid) {
  const def = cardDef(id);
  return {
    uid,
    id: def.id,
    name: def.name,
    kind: def.kind,
    cost: def.cost,
    attack: def.attack || 0,
    health: def.health || 0,
    maxHealth: def.health || 0,
    tide: def.tide,
    effect: def.effect || null,
    power: def.power || 0,
    text: def.text,
    canAttack: false,
    justPlayed: true,
  };
}
