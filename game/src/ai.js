// ai.js — the opposing duelist: a readable opponent, not a random one.
//
// The AI plays in visible steps (one action every ~650 ms) so the player
// can watch its plan form and answer it. Its rules are simple enough to
// read and counter:
//   1. It clears a Guard before it ever hits the duelist.
//   2. It trades up: it attacks a creature only when its own survives or
//      the trade kills something bigger.
//   3. It goes for the duelist when the board is clear or the kill is there.
//   4. It saves a heal until it is hurt, and a sweep until the player has
//      at least two creatures out.
//   5. It spends its energy greedily on the biggest creature it can afford,
//      then fills the board with what is left.

function runAiTurn(game) {
  const steps = planAiTurn(game);
  let i = 0;
  function nextStep() {
    if (game.over) { game.aiBusy = false; startPlayerTurn(game); return; }
    if (i >= steps.length) {
      game.aiBusy = false;
      startPlayerTurn(game);
      return;
    }
    steps[i]();
    i++;
    setTimeout(nextStep, 650);
  }
  setTimeout(nextStep, 700);
}

// Build the turn as a list of small actions, then play them one by one.
function planAiTurn(game) {
  const steps = [];
  const me = game.enemy;
  const foe = game.player;

  // --- Spells first: heal when hurt, sweep when the board is crowded. ---
  // Each step captures its card object, not its hand index, because an
  // earlier step may have shifted the hand.
  const healIdx = me.hand.findIndex((c) => c.effect === 'heal' && me.life <= 12);
  if (healIdx !== -1 && me.hand[healIdx].cost <= me.energy) {
    const card = me.hand[healIdx];
    steps.push(() => { const i = indexOfCard(me, card); if (i !== -1) playCard(game, me, i); });
  }
  const sweepIdx = me.hand.findIndex((c) => c.effect === 'sweep' && foe.field.length >= 2);
  if (sweepIdx !== -1 && me.hand[sweepIdx].cost <= me.energy) {
    const card = me.hand[sweepIdx];
    steps.push(() => { const i = indexOfCard(me, card); if (i !== -1) playCard(game, me, i); });
  }
  const drawIdx = me.hand.findIndex((c) => c.effect === 'draw' && me.hand.length <= 4);
  if (drawIdx !== -1 && me.hand[drawIdx].cost <= me.energy) {
    const card = me.hand[drawIdx];
    steps.push(() => { const i = indexOfCard(me, card); if (i !== -1) playCard(game, me, i); });
  }

  // --- Creatures: biggest affordable first, then the rest. ---
  const creatures = me.hand
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.kind === 'creature')
    .sort((a, b) => b.c.cost - a.c.cost);
  for (const { c } of creatures) {
    steps.push(() => {
      const idx = indexOfCard(me, c);
      if (idx !== -1 && canPlayCard(game, me, c)) playCard(game, me, idx);
    });
  }

  // --- A targeted blast at the player's biggest creature, or face. ---
  const blastCard = me.hand.find((c) => c.effect === 'damage');
  if (blastCard) {
    steps.push(() => {
      const idx = indexOfCard(me, blastCard);
      if (idx === -1) return;
      const card = me.hand[idx];
      if (card.cost > me.energy) return;
      const biggest = foe.field.slice().sort((a, b) => effectiveAttack(game, foe, b) - effectiveAttack(game, foe, a))[0];
      if (biggest && effectiveAttack(game, foe, biggest) >= 4) {
        playCard(game, me, idx, { kind: 'creature', side: foe, card: biggest });
      } else if (foe.life <= card.power) {
        playCard(game, me, idx, { kind: 'duelist', side: foe });
      }
    });
  }

  // --- Attacks: clear Guards, trade up, then hit the duelist. ---
  steps.push(() => aiAttackPhase(game));
  return steps;
}

function indexOfCard(duelist, card) {
  return duelist.hand.indexOf(card);
}

function aiAttackPhase(game) {
  const me = game.enemy;
  const foe = game.player;
  // Attackers act strongest first so the big trades happen early.
  const attackers = me.field.filter((c) => c.canAttack)
    .sort((a, b) => effectiveAttack(game, me, b) - effectiveAttack(game, me, a));
  for (const attacker of attackers) {
    if (game.over) return;
    if (me.field.indexOf(attacker) === -1) continue; // died in an earlier trade
    const guards = foe.field.filter((c) => c.text.indexOf('Guard') !== -1);
    if (guards.length > 0) {
      // Must clear the Guard: send the weakest attacker that can kill it,
      // so the big ones stay free to hit the duelist.
      const guard = guards[0];
      const killer = me.field.filter((c) => c.canAttack)
        .sort((a, b) => effectiveAttack(game, me, a) - effectiveAttack(game, me, b))
        .find((c) => effectiveAttack(game, me, c) >= guard.health);
      if (killer) { attackWith(game, me, killer, { kind: 'creature', card: guard }); continue; }
      attackWith(game, me, attacker, { kind: 'creature', card: guard });
      continue;
    }
    // No Guard: trade up when it kills something bigger, else go face.
    const prey = foe.field.slice()
      .sort((a, b) => effectiveAttack(game, foe, b) - effectiveAttack(game, foe, a))
      .find((c) => effectiveAttack(game, me, attacker) >= c.health && effectiveAttack(game, foe, c) > effectiveAttack(game, me, attacker));
    if (prey) {
      attackWith(game, me, attacker, { kind: 'creature', card: prey });
    } else {
      attackWith(game, me, attacker, { kind: 'duelist' });
    }
  }
}
