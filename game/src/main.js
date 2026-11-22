// main.js — boot, input and screens for Tidebound Duel.
//
// The game is plain classic scripts, loaded in dependency order by
// index.html: cards, state, ai, render, audio, then this file. No modules,
// no imports, no network: everything the page needs is a file under game/.
//
// Screenshot hook: open the page with a query string and it jumps straight
// to that screen with a seeded table, so a screenshot is reproducible:
//   ?screen=title            the title screen
//   ?screen=play&seed=7      a mid-game table (seed 7 is the default)
//   ?screen=win&seed=7       the victory screen over a finished board
//   ?screen=loss&seed=7      the defeat screen over a finished board
//
// Controls: click a hand card to pick it up, click again (or your field)
// to play it; click one of your creatures, then an enemy creature or
// Maris herself, to attack. Space ends the turn, 1–7 picks a hand card,
// Esc cancels, M mutes.

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const params = new URLSearchParams(window.location.search);
  const screenParam = params.get('screen');
  const seed = parseInt(params.get('seed') || '7', 10) || 7;

  let game = null;
  let lastScreen = null;

  function showTitle() {
    game = newGame(seed);
    game.screen = 'title';
    game.log = ['Welcome to the reef. Press PLAY to duel Maris.'];
  }

  function startDuel() {
    game = newGame(Date.now() % 2147483647);
    unlockAudio();
    playSound('turn');
  }

  // Open on the requested screen, or the title when none was asked for.
  if (screenParam === 'play') {
    game = buildDemo(seed, null);
  } else if (screenParam === 'win') {
    game = buildDemo(seed, 'win');
  } else if (screenParam === 'loss') {
    game = buildDemo(seed, 'loss');
  } else {
    showTitle();
  }

  // ---- Input: mouse -------------------------------------------------------

  function pointIn(rect, x, y) {
    return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function canvasPoint(event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - r.left) * (W / r.width),
      y: (event.clientY - r.top) * (H / r.height),
    };
  }

  function cancelSelection() {
    game.selectedHand = -1;
    game.selectedField = -1;
    game.targeting = null;
    game.message = '';
  }

  function tryPlaySelected() {
    const i = game.selectedHand;
    if (i < 0) return;
    const card = game.player.hand[i];
    if (!card) { cancelSelection(); return; }
    const result = playCard(game, game.player, i);
    if (result === 'played') {
      playSound(card.kind === 'spell' && card.effect === 'heal' ? 'heal' : 'play');
      cancelSelection();
    } else if (result === 'target') {
      playSound('play');
      game.selectedHand = -1;
    } else {
      playSound('error');
    }
  }

  function tryAttack(attackerIdx, target) {
    const attacker = game.player.field[attackerIdx];
    if (!attacker) return;
    const ok = attackWith(game, game.player, attacker, target);
    if (ok) {
      playSound('attack');
      cancelSelection();
    } else {
      playSound('error');
    }
  }

  canvas.addEventListener('click', function (event) {
    unlockAudio();
    if (!game || game.aiBusy) return;
    const p = canvasPoint(event);

    if (game.screen === 'title') {
      if (pointIn(layout.playRect, p.x, p.y)) startDuel();
      return;
    }
    if (game.screen === 'win' || game.screen === 'loss') {
      if (pointIn(layout.againRect, p.x, p.y)) startDuel();
      return;
    }

    // End Turn.
    if (pointIn(layout.endTurnRect, p.x, p.y)) {
      endPlayerTurn(game);
      playSound('turn');
      return;
    }

    // A spell is waiting for a target: clicks resolve it.
    if (game.targeting) {
      const t = game.targeting;
      if (t.effect === 'buff') {
        for (let i = 0; i < layout.playerFieldRects.length; i++) {
          if (pointIn(layout.playerFieldRects[i], p.x, p.y)) {
            const card = game.player.field[i];
            playCard(game, game.player, t.handIndex, { kind: 'creature', side: game.player, card });
            playSound('play');
            cancelSelection();
            return;
          }
        }
      } else {
        for (let i = 0; i < layout.enemyFieldRects.length; i++) {
          if (pointIn(layout.enemyFieldRects[i], p.x, p.y)) {
            const card = game.enemy.field[i];
            playCard(game, game.player, t.handIndex, { kind: 'creature', side: game.enemy, card });
            playSound('play');
            cancelSelection();
            return;
          }
        }
        if (pointIn(layout.enemyDuelistRect, p.x, p.y)) {
          playCard(game, game.player, t.handIndex, { kind: 'duelist', side: game.enemy });
          playSound('play');
          cancelSelection();
          return;
        }
      }
      // Clicked nowhere useful: cancel the spell.
      cancelSelection();
      return;
    }

    // An attacker is chosen: clicks pick what it hits.
    if (game.selectedField >= 0) {
      for (let i = 0; i < layout.enemyFieldRects.length; i++) {
        if (pointIn(layout.enemyFieldRects[i], p.x, p.y)) {
          tryAttack(game.selectedField, { kind: 'creature', card: game.enemy.field[i] });
          return;
        }
      }
      if (pointIn(layout.enemyDuelistRect, p.x, p.y)) {
        tryAttack(game.selectedField, { kind: 'duelist' });
        return;
      }
      // Clicked the attacker again, or empty table: stand down.
      cancelSelection();
      return;
    }

    // A hand card is picked up: a second click on it, or on your field,
    // plays it; clicking another hand card switches the pick.
    if (game.selectedHand >= 0) {
      for (let i = 0; i < layout.handRects.length; i++) {
        if (pointIn(layout.handRects[i], p.x, p.y)) {
          if (i === game.selectedHand) { tryPlaySelected(); return; }
          game.selectedHand = i;
          return;
        }
      }
      for (let i = 0; i < layout.playerFieldRects.length; i++) {
        if (pointIn(layout.playerFieldRects[i], p.x, p.y)) { tryPlaySelected(); return; }
      }
      cancelSelection();
      return;
    }

    // Nothing picked up yet: pick up a hand card, or choose an attacker.
    for (let i = 0; i < layout.handRects.length; i++) {
      if (pointIn(layout.handRects[i], p.x, p.y)) {
        game.selectedHand = i;
        return;
      }
    }
    for (let i = 0; i < layout.playerFieldRects.length; i++) {
      if (pointIn(layout.playerFieldRects[i], p.x, p.y)) {
        const card = game.player.field[i];
        if (card.canAttack) game.selectedField = i;
        return;
      }
    }
  });

  canvas.addEventListener('mousemove', function (event) {
    const p = canvasPoint(event);
    layout.mouseX = p.x;
    layout.mouseY = p.y;
    layout.hoverIndex = -1;
    if (game && game.screen === 'play') {
      for (let i = 0; i < layout.handRects.length; i++) {
        if (pointIn(layout.handRects[i], p.x, p.y)) { layout.hoverIndex = i; break; }
      }
    }
    // Pointer cursor over anything clickable.
    let over = false;
    if (game) {
      const rects = [layout.playRect, layout.againRect, layout.endTurnRect]
        .concat(layout.handRects, layout.playerFieldRects, layout.enemyFieldRects);
      for (const r of rects) {
        if (pointIn(r, p.x, p.y)) { over = true; break; }
      }
    }
    canvas.style.cursor = over ? 'pointer' : 'default';
  });

  // ---- Input: keyboard ------------------------------------------------------

  document.addEventListener('keydown', function (event) {
    if (!game) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (game.screen === 'title') { startDuel(); return; }
      if (game.screen === 'play' && !game.aiBusy && !game.over) {
        endPlayerTurn(game);
        playSound('turn');
      }
    } else if (event.code === 'Escape') {
      if (game.screen === 'play') cancelSelection();
    } else if (event.code === 'KeyM') {
      toggleMute();
    } else if (game.screen === 'play' && /^Digit[1-7]$/.test(event.code)) {
      const i = parseInt(event.code.slice(5), 10) - 1;
      if (i < game.player.hand.length) game.selectedHand = i;
    }
  });

  // ---- Main loop --------------------------------------------------------------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.screen === 'win' && lastScreen !== 'win') playSound('win');
    if (game.screen === 'loss' && lastScreen !== 'loss') playSound('loss');
    lastScreen = game.screen;
    render(ctx, game, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
