// state.js — the rules of Tidebound Duel and the state a match lives in.
//
// A match is a plain object so the renderer and the AI can read it without
// knowing how turns work:
//   screen: 'title' | 'play' | 'win' | 'loss'
//   turn:   the turn number (both duelists share it)
//   player / enemy: { life, energy, maxEnergy, hand[], field[], deck[] }
//   log:    short strings for the battle log panel
//   over:   true once somebody's life has hit zero
//
// Energy: each duelist starts a turn with maxEnergy = min(turn, 10) and
// refills to it. A hand holds at most 7 cards; a field at most 5 creatures.
// Creatures cannot attack the turn they are played unless they are Swift.
// Guard creatures must be attacked before anything else on their side.

const START_LIFE = 20;
const MAX_HAND = 7;
const MAX_FIELD = 5;
const MAX_ENERGY = 10;

let uidCounter = 1;
function nextUid() { return uidCounter++; }

// A tiny seeded random generator, so a screenshot link can rebuild the
// same mid-game table every time it is opened.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  }
  return list;
}

function makeDuelist(deckIds) {
  return {
    life: START_LIFE,
    energy: 0,
    maxEnergy: 0,
    hand: [],
    field: [],
    deck: deckIds.slice(),
  };
}

function newGame(seed) {
  const rng = mulberry32(seed || (Date.now() % 2147483647));
  uidCounter = 1;
  const game = {
    screen: 'play',
    turn: 1,
    over: false,
    winner: null,
    rng,
    seed: seed || 0,
    player: makeDuelist(shuffle(buildDeck(), rng)),
    enemy: makeDuelist(shuffle(buildDeck(), rng)),
    log: ['The tide rolls in. Duel begins — 20 life each.'],
    selectedHand: -1,   // index into player.hand, or -1
    selectedField: -1,  // index into player.field, or -1 (attacking)
    targeting: null,    // { cardUid, effect } while a spell picks a target
    message: '',
    floats: [],         // floating damage/heal numbers {x,y,text,color,life}
    shake: 0,           // screen shake left, in pixels
    aiBusy: false,
  };
  drawCards(game.player, 3);
  drawCards(game.enemy, 3);
  beginTurn(game, game.player);
  return game;
}

function drawCards(duelist, n) {
  for (let i = 0; i < n; i++) {
    if (duelist.hand.length >= MAX_HAND) return;
    const id = duelist.deck.shift();
    if (!id) return;
    duelist.hand.push(makeCard(id, nextUid()));
  }
}

function beginTurn(game, duelist) {
  duelist.maxEnergy = Math.min(game.turn, MAX_ENERGY);
  duelist.energy = duelist.maxEnergy;
  for (const c of duelist.field) {
    c.canAttack = true;
    c.justPlayed = false;
  }
}

// Tidebond: a creature gains +1/+1 while another creature of the same tide
// stands beside it on the same field.
function tidebondBonus(field, card) {
  const friends = field.filter((c) => c.uid !== card.uid && c.tide === card.tide);
  return friends.length > 0 ? 1 : 0;
}

function effectiveAttack(game, side, card) {
  return card.attack + tidebondBonus(side.field, card);
}

function effectiveHealth(card) {
  return card.health;
}

function guardOnField(field) {
  return field.some((c) => c.text.indexOf('Guard') !== -1);
}

function addLog(game, text) {
  game.log.push(text);
  if (game.log.length > 6) game.log.shift();
}

function floatText(game, target, text, color) {
  // The renderer resolves the position from the target each frame, so a
  // number follows its creature even while the board moves.
  game.floats.push({ x: null, y: null, target, text, color, life: 1 });
}

function checkEnd(game) {
  if (game.over) return;
  if (game.enemy.life <= 0) {
    game.over = true; game.winner = 'player'; game.screen = 'win';
    addLog(game, 'The enemy duelist falls. You win the duel!');
  } else if (game.player.life <= 0) {
    game.over = true; game.winner = 'enemy'; game.screen = 'loss';
    addLog(game, 'Your light goes out beneath the waves.');
  }
}

// ---- Playing cards -------------------------------------------------------

function canPlayCard(game, duelist, card) {
  if (game.over) return false;
  if (card.cost > duelist.energy) return false;
  if (card.kind === 'creature' && duelist.field.length >= MAX_FIELD) return false;
  return true;
}

// Play a card from a hand. For spells that need a target, this only arms
// the targeting step and returns 'target'; otherwise it resolves at once
// and returns 'played'. Returns false when the play is not legal.
function playCard(game, duelist, handIndex, target) {
  const card = duelist.hand[handIndex];
  if (!card || !canPlayCard(game, duelist, card)) return false;
  const isPlayer = duelist === game.player;

  if (card.kind === 'spell' && (card.effect === 'damage' || card.effect === 'buff' || card.effect === 'bounce')) {
    if (!target) {
      game.targeting = { cardUid: card.uid, effect: card.effect, handIndex };
      game.message = card.effect === 'buff' ? 'Choose one of your creatures.' : 'Choose a target.';
      return 'target';
    }
  }

  duelist.hand.splice(handIndex, 1);
  duelist.energy -= card.cost;
  game.targeting = null;
  game.message = '';

  if (card.kind === 'creature') {
    card.canAttack = card.text.indexOf('Swift') !== -1;
    card.justPlayed = true;
    duelist.field.push(card);
    addLog(game, (isPlayer ? 'You play ' : 'Foe plays ') + card.name + ' (' + card.attack + '/' + card.health + ').');
    return 'played';
  }

  resolveSpell(game, duelist, card, target);
  return 'played';
}

function resolveSpell(game, duelist, card, target) {
  const isPlayer = duelist === game.player;
  const foe = isPlayer ? game.enemy : game.player;
  const who = isPlayer ? 'You cast ' : 'Foe casts ';
  if (card.effect === 'heal') {
    duelist.life = Math.min(START_LIFE, duelist.life + card.power);
    floatText(game, { kind: 'duelist', side: isPlayer ? 'player' : 'enemy' }, '+' + card.power, '#7be495');
    addLog(game, who + card.name + ': +' + card.power + ' life.');
  } else if (card.effect === 'draw') {
    drawCards(duelist, card.power);
    addLog(game, who + card.name + ': draws ' + card.power + ' cards.');
  } else if (card.effect === 'sweep') {
    for (const c of foe.field.slice()) damageCreature(game, foe, c, card.power, null);
    addLog(game, who + card.name + ': a wave hits every enemy creature.');
  } else if (card.effect === 'damage' && target) {
    if (target.kind === 'duelist') {
      damageDuelist(game, target.side, card.power);
      addLog(game, who + card.name + ': ' + card.power + ' damage to the duelist.');
    } else {
      damageCreature(game, target.side, target.card, card.power, duelist);
      addLog(game, who + card.name + ': ' + card.power + ' damage to ' + target.card.name + '.');
    }
  } else if (card.effect === 'buff' && target) {
    target.card.attack += card.power;
    target.card.health += card.power;
    target.card.maxHealth += card.power;
    addLog(game, who + card.name + ': ' + target.card.name + ' grows +' + card.power + '/+' + card.power + '.');
  } else if (card.effect === 'bounce' && target) {
    const side = target.side;
    const idx = side.field.indexOf(target.card);
    if (idx !== -1) {
      side.field.splice(idx, 1);
      if (side.hand.length < MAX_HAND) side.hand.push(target.card);
      addLog(game, who + card.name + ': ' + target.card.name + ' is swept back to hand.');
    }
  }
  checkEnd(game);
}

// ---- Combat --------------------------------------------------------------

function damageDuelist(game, side, amount) {
  side.life -= amount;
  game.shake = Math.max(game.shake, 6);
  floatText(game, { kind: 'duelist', side: side === game.player ? 'player' : 'enemy' }, '-' + amount, '#ff6b6b');
  checkEnd(game);
}

function damageCreature(game, side, card, amount, attackerSide) {
  card.health -= amount;
  floatText(game, { kind: 'creature', uid: card.uid, side: side === game.player ? 'player' : 'enemy' }, '-' + amount, '#ffb347');
  if (card.health <= 0) {
    const idx = side.field.indexOf(card);
    if (idx !== -1) side.field.splice(idx, 1);
    addLog(game, card.name + ' sinks beneath the waves.');
  }
}

// One creature attacks another creature, or the opposing duelist.
// Returns true when the attack happened.
function attackWith(game, attackerSide, card, target) {
  if (game.over) return false;
  if (!card.canAttack) return false;
  const defenderSide = attackerSide === game.player ? game.enemy : game.player;
  const atk = effectiveAttack(game, attackerSide, card);

  if (target.kind === 'duelist') {
    if (guardOnField(defenderSide.field)) return false;
    card.canAttack = false;
    damageDuelist(game, defenderSide, atk);
    if (card.text.indexOf('Drain') !== -1) {
      attackerSide.life = Math.min(START_LIFE, attackerSide.life + atk);
    }
    addLog(game, (attackerSide === game.player ? 'Your ' : 'Foe ') + card.name + ' strikes the duelist for ' + atk + '.');
    return true;
  }

  // Creature vs creature: Guard must be respected, both sides take damage.
  if (guardOnField(defenderSide.field) && target.card.text.indexOf('Guard') === -1) return false;
  card.canAttack = false;
  const targetAtk = effectiveAttack(game, defenderSide, target.card);
  damageCreature(game, defenderSide, target.card, atk, attackerSide);
  damageCreature(game, attackerSide, card, targetAtk, defenderSide);
  if (card.text.indexOf('Drain') !== -1 && target.card.health > 0) {
    attackerSide.life = Math.min(START_LIFE, attackerSide.life + atk);
  }
  addLog(game, (attackerSide === game.player ? 'Your ' : 'Foe ') + card.name + ' trades with ' + target.card.name + '.');
  checkEnd(game);
  return true;
}

// ---- Turns -----------------------------------------------------------------

function endPlayerTurn(game) {
  if (game.over || game.aiBusy) return;
  game.selectedHand = -1;
  game.selectedField = -1;
  game.targeting = null;
  game.message = '';
  game.turn += 1;
  beginTurn(game, game.enemy);
  drawCards(game.enemy, 1);
  addLog(game, 'Turn ' + game.turn + ' — the foe draws and plays.');
  game.aiBusy = true;
  runAiTurn(game);
}

function startPlayerTurn(game) {
  beginTurn(game, game.player);
  drawCards(game.player, 1);
  game.aiBusy = false;
  addLog(game, 'Your turn — ' + game.player.maxEnergy + ' energy, draw a card.');
}

// ---- Seeded demo states for screenshots -------------------------------------
// buildDemo builds a mid-game table that looks lived-in: both fields partly
// full, hands fanned, life totals dented. The same seed always builds the
// same table, so a screenshot link is reproducible.

function buildDemo(seed, outcome) {
  const game = newGame(seed);
  const demoIds = ['tide-runner', 'shell-squire', 'spark-eel', 'coral-knight', 'kelp-dancer', 'storm-heron'];
  const enemyIds = ['abyss-jelly', 'grove-turtle', 'ember-crab', 'leviathan-calf', 'tide-runner'];
  game.player.field = demoIds.slice(0, 4).map((id) => {
    const c = makeCard(id, nextUid()); c.canAttack = true; c.justPlayed = false; return c;
  });
  game.enemy.field = enemyIds.slice(0, 3).map((id) => {
    const c = makeCard(id, nextUid()); c.canAttack = true; c.justPlayed = false; return c;
  });
  game.player.life = 14; game.enemy.life = 11;
  game.player.energy = 6; game.player.maxEnergy = 7;
  game.enemy.energy = 5; game.enemy.maxEnergy = 7;
  game.turn = 7;
  game.log = [
    'Your Tide Runner trades with the Abyss Jelly.',
    'Foe plays Leviathan Calf (5/5).',
    'Storm Surge sweeps the enemy field.',
    'Turn 7 — the tide turns in your favour.',
  ];
  if (outcome === 'win') {
    game.enemy.life = 0; game.over = true; game.winner = 'player'; game.screen = 'win';
  } else if (outcome === 'loss') {
    game.player.life = 0; game.over = true; game.winner = 'enemy'; game.screen = 'loss';
  }
  return game;
}
