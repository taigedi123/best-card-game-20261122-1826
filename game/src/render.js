// render.js — drawing the table: the ocean, the cards, the duelists and
// the screens. Everything is canvas 2D, no images, so the game loads
// nothing over the network and every card is drawn, not pasted.
//
// The renderer also owns the hit-test layout: after each draw it leaves
// `layout` holding the rectangles the input layer needs (hand cards,
// field creatures, buttons, portraits), so main.js can map a click to a
// game action without knowing any coordinates.

const W = 1280;
const H = 800;

const layout = {
  handRects: [],
  playerFieldRects: [],
  enemyFieldRects: [],
  enemyHandRects: [],
  endTurnRect: null,
  playRect: null,
  againRect: null,
  howRect: null,
  playerDuelistRect: null,
  enemyDuelistRect: null,
  hoverIndex: -1,
  mouseX: -1,
  mouseY: -1,
  time: 0,
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Tide shapes: colour AND shape tell a card apart ---------------------

function drawTideShape(ctx, shape, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineJoin = 'round';
  if (shape === 'shell') {
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.15, size * 0.55, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(cx + i * size * 0.2, cy + size * 0.15);
      ctx.lineTo(cx + i * size * 0.32, cy - size * 0.5);
    }
    ctx.stroke();
  } else if (shape === 'wave') {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.6, cy);
    ctx.bezierCurveTo(cx - size * 0.3, cy - size * 0.7, cx + size * 0.1, cy + size * 0.5, cx + size * 0.6, cy - size * 0.2);
    ctx.bezierCurveTo(cx + size * 0.3, cy + size * 0.35, cx - size * 0.1, cy - size * 0.4, cx - size * 0.6, cy + size * 0.1);
    ctx.closePath();
    ctx.fill();
  } else if (shape === 'bolt') {
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.15, cy - size * 0.6);
    ctx.lineTo(cx - size * 0.35, cy + size * 0.05);
    ctx.lineTo(cx - size * 0.02, cy + size * 0.05);
    ctx.lineTo(cx - size * 0.15, cy + size * 0.6);
    ctx.lineTo(cx + size * 0.35, cy - size * 0.05);
    ctx.lineTo(cx + size * 0.02, cy - size * 0.05);
    ctx.closePath();
    ctx.fill();
  } else { // leaf
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.6);
    ctx.bezierCurveTo(cx + size * 0.6, cy - size * 0.2, cx + size * 0.5, cy + size * 0.5, cx, cy + size * 0.6);
    ctx.bezierCurveTo(cx - size * 0.5, cy + size * 0.5, cx - size * 0.6, cy - size * 0.2, cx, cy - size * 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.5);
    ctx.lineTo(cx, cy + size * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Background ------------------------------------------------------------

function drawBackground(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2e4a');
  g.addColorStop(0.5, '#0d4a6b');
  g.addColorStop(1, '#082a3f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Slow light rays from the surface.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#bfe8ff';
  for (let i = 0; i < 5; i++) {
    const x = 180 + i * 240 + Math.sin(t * 0.0002 + i) * 30;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 90, 0);
    ctx.lineTo(x + 220, H);
    ctx.lineTo(x + 60, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rolling wave lines near the top and bottom edges.
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 200, 240, 0.18)';
  ctx.lineWidth = 3;
  for (let row = 0; row < 3; row++) {
    ctx.beginPath();
    const yBase = 96 + row * 14;
    for (let x = 0; x <= W; x += 16) {
      const y = yBase + Math.sin(x * 0.02 + t * 0.001 + row * 2) * 6;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // The table: a reef-green felt ellipse the duel is fought on.
  ctx.save();
  ctx.fillStyle = '#0e5a44';
  ctx.strokeStyle = '#1d8a68';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(W / 2, 400, 560, 330, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W / 2, 400, 520, 300, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---- Cards -----------------------------------------------------------------

function drawCard(ctx, card, x, y, w, h, opts) {
  opts = opts || {};
  const tide = TIDES[card.tide];
  const playable = !!opts.playable;
  const selected = !!opts.selected;
  const hovered = !!opts.hovered;
  const dimmed = !!opts.dimmed;
  const targetable = !!opts.targetable;

  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.55;
  if (opts.lift) { y -= opts.lift; }

  // Card body.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = selected || hovered ? 22 : 10;
  ctx.shadowOffsetY = 5;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = '#f7f3e8';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeStyle = selected ? '#ffd94d' : (targetable ? '#ff5d5d' : tide.dark);
  ctx.stroke();

  // Tide banner across the top.
  roundRect(ctx, x + 3, y + 3, w - 6, h * 0.30, 8);
  ctx.fillStyle = tide.color;
  ctx.fill();
  // Tide shape watermark, big and pale, behind the art area.
  ctx.globalAlpha = (dimmed ? 0.55 : 1) * 0.16;
  drawTideShape(ctx, tide.shape, x + w / 2, y + h * 0.52, w * 0.42, tide.dark);
  ctx.globalAlpha = dimmed ? 0.55 : 1;

  // Cost gem, top-left.
  ctx.beginPath();
  ctx.arc(x + 16, y + 16, 13, 0, Math.PI * 2);
  ctx.fillStyle = playable ? '#2f6fd0' : '#5a6b7d';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(card.cost), x + 16, y + 17);

  // Tide shape badge, top-right.
  drawTideShape(ctx, tide.shape, x + w - 18, y + 17, 15, '#ffffff');

  // Name: one line when it fits between the cost gem and the tide badge,
  // otherwise split across two lines so no letter hides behind the gem.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + Math.max(12, w * 0.115) + 'px Georgia, serif';
  ctx.textAlign = 'center';
  const nameMaxW = w - 40;
  if (ctx.measureText(card.name).width <= nameMaxW) {
    ctx.fillText(card.name, x + w / 2, y + h * 0.22, nameMaxW);
  } else {
    const words = card.name.split(' ');
    let best = null;
    for (let s = 1; s < words.length; s++) {
      const a = words.slice(0, s).join(' ');
      const b = words.slice(s).join(' ');
      const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || m < best.m) best = { a, b, m };
    }
    ctx.fillText(best.a, x + w / 2, y + h * 0.15, nameMaxW);
    ctx.fillText(best.b, x + w / 2, y + h * 0.27, nameMaxW);
  }

  // Small tide shape under the name, in the art area.
  drawTideShape(ctx, tide.shape, x + w / 2, y + h * 0.46, w * 0.20, tide.color);

  // Rules text.
  ctx.fillStyle = '#22303a';
  ctx.font = 'italic ' + Math.max(10, w * 0.085) + 'px Georgia, serif';
  ctx.textAlign = 'center';
  wrapText(ctx, card.text, x + w / 2, y + h * 0.68, w - 16, 13);

  // Attack / health pips for creatures; effect word for spells.
  if (card.kind === 'creature') {
    drawPip(ctx, x + 16, y + h - 16, 13, '#c0392b', String(card.attack));
    drawPip(ctx, x + w - 16, y + h - 16, 13, '#277a4b', String(card.health));
    if (!card.canAttack && !opts.field) {
      ctx.fillStyle = 'rgba(30,40,50,0.75)';
      ctx.font = 'bold 10px Georgia, serif';
      ctx.fillText('RESTING', x + w / 2, y + h - 10);
    }
  } else {
    ctx.fillStyle = '#5a3691';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.fillText('SPELL', x + w / 2, y + h - 12);
  }
  ctx.restore();
}

function drawPip(ctx, cx, cy, r, color, text) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

// ---- Duelist portraits, life and energy -------------------------------------

function drawDuelist(ctx, duelist, x, y, name, isPlayer, color) {
  ctx.save();
  // Portrait medallion.
  ctx.beginPath();
  ctx.arc(x + 34, y + 34, 32, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  drawTideShape(ctx, isPlayer ? 'wave' : 'bolt', x + 34, y + 34, 30, 'rgba(255,255,255,0.9)');
  layout[isPlayer ? 'playerDuelistRect' : 'enemyDuelistRect'] = { x: x + 2, y: y + 2, w: 64, h: 64 };

  // Name + life bar.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.fillText(name, x + 78, y + 24);
  const barW = 150;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x + 78, y + 32, barW, 16, 8);
  ctx.fill();
  const lifeFrac = Math.max(0, duelist.life / START_LIFE);
  ctx.fillStyle = lifeFrac > 0.5 ? '#4fc06a' : (lifeFrac > 0.25 ? '#f0a13c' : '#e05252');
  if (lifeFrac > 0) {
    roundRect(ctx, x + 78, y + 32, Math.max(16, barW * lifeFrac), 16, 8);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(duelist.life + ' / ' + START_LIFE, x + 78 + barW + 10, y + 46);

  // Energy crystals.
  for (let i = 0; i < MAX_ENERGY; i++) {
    const ex = x + 78 + i * 17;
    const ey = y + 58;
    ctx.beginPath();
    ctx.arc(ex + 6, ey + 6, 6, 0, Math.PI * 2);
    ctx.fillStyle = i < duelist.energy ? '#3fb7ff' : 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
  }
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '13px Georgia, serif';
  ctx.fillText(duelist.energy + ' energy', x + 78 + MAX_ENERGY * 17 + 6, y + 70);
  ctx.restore();
}

function drawCardBack(ctx, x, y, w, h) {
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = '#274b63';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7fc4e8';
  ctx.stroke();
  drawTideShape(ctx, 'wave', x + w / 2, y + h / 2, w * 0.32, '#7fc4e8');
}

// ---- Buttons -----------------------------------------------------------------

function drawButton(ctx, rect, label, enabled) {
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fillStyle = enabled ? '#e8a13c' : '#5a6b7d';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = enabled ? '#ffd94d' : 'rgba(255,255,255,0.3)';
  ctx.stroke();
  ctx.fillStyle = enabled ? '#2b1c05' : '#dfe6ec';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

// ---- Floating damage numbers -------------------------------------------------

function resolveFloatPos(game, f) {
  if (f.x !== null && f.x !== undefined) return;
  const t = f.target;
  if (t.kind === 'duelist') {
    const r = t.side === 'player' ? layout.playerDuelistRect : layout.enemyDuelistRect;
    f.x = r ? r.x + r.w / 2 : W / 2;
    f.y = r ? r.y + r.h + 10 : 100;
  } else {
    const rects = t.side === 'player' ? layout.playerFieldRects : layout.enemyFieldRects;
    const hit = rects.find((r) => r.uid === t.uid);
    f.x = hit ? hit.x + hit.w / 2 : W / 2;
    f.y = hit ? hit.y - 6 : 300;
  }
}

function drawFloats(ctx, game, dt) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floats) {
    resolveFloatPos(game, f);
    f.life -= dt * 0.9;
    f.y -= dt * 34;
    if (f.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, f.life * 1.4);
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
  game.floats = game.floats.filter((f) => f.life > 0);
}

// ---- The table -----------------------------------------------------------------

function drawTable(ctx, game, dt) {
  layout.handRects = [];
  layout.playerFieldRects = [];
  layout.enemyFieldRects = [];
  layout.enemyHandRects = [];
  layout.endTurnRect = { x: 1096, y: 736, w: 160, h: 48 };

  drawBackground(ctx, layout.time);

  // Enemy duelist, top-left; enemy hand as card backs, top-centre.
  drawDuelist(ctx, game.enemy, 24, 14, 'Maris, Tide-Witch', false, '#8a5fd0');
  for (let i = 0; i < game.enemy.hand.length; i++) {
    const x = 560 + i * 34;
    drawCardBack(ctx, x, 18, 46, 64);
    layout.enemyHandRects.push({ x, y: 18, w: 46, h: 64 });
  }
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Turn ' + game.turn, 560, 108);

  // Enemy field, upper half of the table.
  drawField(ctx, game, game.enemy, 150, false);

  // Centre strip: message, targeting hint, battle log.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 16px Georgia, serif';
  const hint = game.targeting ? game.message : (game.aiBusy ? 'Maris is thinking…' : (game.message || 'Play a card, or send a creature to attack.'));
  ctx.fillText(hint, W / 2, 322);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'left';
  const logLines = game.log.slice(-3);
  logLines.forEach((line, i) => ctx.fillText('› ' + line, 24, 330 + i * 16));
  ctx.restore();

  // Player field, lower half of the table.
  drawField(ctx, game, game.player, 352, true);

  // Player hand, fanned along the bottom.
  drawHand(ctx, game);

  // Player duelist, bottom-left; End Turn, bottom-right.
  drawDuelist(ctx, game.player, 24, 700, 'You, Tidebound', true, '#3f8fd2');
  drawButton(ctx, layout.endTurnRect, game.aiBusy ? 'FOE’S TURN…' : 'END TURN  ⏎', !game.aiBusy && !game.over);

  drawFloats(ctx, game, dt);
}

function drawField(ctx, game, side, y, isPlayer) {
  const cards = side.field;
  const cw = 104, ch = 146;
  const gap = 12;
  const totalW = cards.length * cw + Math.max(0, cards.length - 1) * gap;
  let x = (W - totalW) / 2;
  const rects = isPlayer ? layout.playerFieldRects : layout.enemyFieldRects;
  cards.forEach((card) => {
    const isTarget = game.targeting && game.targeting.effect !== 'buff' && !isPlayer;
    const isBuffTarget = game.targeting && game.targeting.effect === 'buff' && isPlayer;
    const selected = isPlayer && game.selectedField !== -1 && side.field[game.selectedField] === card;
    drawCard(ctx, card, x, y, cw, ch, {
      field: true,
      selected,
      targetable: isTarget || isBuffTarget,
      dimmed: isPlayer && !card.canAttack,
    });
    rects.push({ x, y, w: cw, h: ch, uid: card.uid });
    // Attack-ready glow under the card.
    if (isPlayer && card.canAttack && !game.over) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,217,77,' + (0.5 + 0.4 * Math.sin(layout.time * 0.006)) + ')';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 3, y - 3, cw + 6, ch + 6, 12);
      ctx.stroke();
      ctx.restore();
    }
    x += cw + gap;
  });
}

function drawHand(ctx, game) {
  const cards = game.player.hand;
  const cw = 118, ch = 164;
  const gap = 10;
  const totalW = cards.length * cw + Math.max(0, cards.length - 1) * gap;
  let x = (W - totalW) / 2;
  const y = 560;
  cards.forEach((card, i) => {
    const playable = canPlayCard(game, game.player, card) && !game.aiBusy && !game.over;
    const hovered = layout.hoverIndex === i;
    const selected = game.selectedHand === i;
    const lift = hovered ? 26 : (selected ? 14 : 0);
    drawCard(ctx, card, x, y, cw, ch, {
      playable,
      selected,
      hovered,
      lift,
      dimmed: !playable && card.cost > game.player.energy,
    });
    layout.handRects.push({ x, y: y - lift, w: cw, h: ch, index: i });
    x += cw + gap;
  });
}

// ---- Title, win and loss screens ----------------------------------------------

function drawTitle(ctx, game) {
  drawBackground(ctx, layout.time);
  // A fan of cards behind the title.
  const fanIds = ['tempest-drake', 'mother-of-tides', 'reef-titan', 'storm-heron', 'coral-knight'];
  fanIds.forEach((id, i) => {
    const card = makeCard(id, 9000 + i);
    ctx.save();
    ctx.translate(640 + (i - 2) * 130, 372);
    ctx.rotate((i - 2) * 0.09);
    drawCard(ctx, card, -52, -73, 104, 146, { field: true });
    ctx.restore();
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('TIDEBOUND', 640, 138);
  ctx.fillText('DUEL', 640, 222);
  ctx.shadowColor = 'transparent';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillStyle = '#bfe8ff';
  ctx.fillText('A duel of tides, creatures and storms — you against Maris, the Tide-Witch.', 640, 258);
  ctx.restore();

  layout.playRect = { x: 540, y: 470, w: 200, h: 64 };
  drawButton(ctx, layout.playRect, '▶  PLAY', true);

  // How to play, in three short lines.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '16px Georgia, serif';
  ctx.fillText('Spend energy to play creatures and spells — energy grows every turn.', 640, 580);
  ctx.fillText('Creatures attack creatures or the duelist. Guards must be answered first.', 640, 606);
  ctx.fillText('Match tides to wake Tidebond: +1/+1 beside a creature of the same tide.', 640, 632);
  ctx.fillText('First duelist to 0 life loses. Click a card, then click where it goes.', 640, 658);
  ctx.fillStyle = '#8fb8d8';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('Mouse to play · Space ends your turn · 1–7 selects a card from your hand', 640, 700);
  ctx.restore();
}

function drawEndScreen(ctx, game, won) {
  drawTable(ctx, game, 0);
  ctx.save();
  ctx.fillStyle = won ? 'rgba(10,60,40,0.72)' : 'rgba(50,10,30,0.72)';
  ctx.fillRect(0, 0, W, H);

  // Flourish: rising bubbles on a win, sinking ones on a loss.
  for (let i = 0; i < 24; i++) {
    const bx = (i * 53 + 40) % W;
    const by = won
      ? H - ((layout.time * 0.05 + i * 47) % (H + 40))
      : ((layout.time * 0.05 + i * 47) % (H + 40));
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(bx, by, 4 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fillStyle = '#bfe8ff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 76px Georgia, serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.fillText(won ? 'VICTORY!' : 'THE TIDE TAKES YOU', 640, 330);
  ctx.shadowColor = 'transparent';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(
    won ? 'Maris bows to the new Tidebound. The reef is yours.' : 'Maris keeps the reef — this time. Shuffle up and try again.',
    640, 375,
  );
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Georgia, serif';
  ctx.fillText(
    'Turns played: ' + game.turn + '   ·   Your life: ' + Math.max(0, game.player.life) +
    '   ·   Maris’s life: ' + Math.max(0, game.enemy.life),
    640, 420,
  );

  layout.againRect = { x: 540, y: 470, w: 200, h: 64 };
  drawButton(ctx, layout.againRect, '↻  PLAY AGAIN', true);
  ctx.restore();
}

// ---- Entry point -----------------------------------------------------------------

function render(ctx, game, dt) {
  layout.time += dt * 1000;
  if (game.shake > 0) {
    const s = game.shake;
    game.shake = Math.max(0, game.shake - dt * 22);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    renderInner(ctx, game, dt);
    ctx.restore();
  } else {
    renderInner(ctx, game, dt);
  }
}

function renderInner(ctx, game, dt) {
  if (game.screen === 'title') {
    drawTitle(ctx, game);
  } else if (game.screen === 'win') {
    drawEndScreen(ctx, game, true);
  } else if (game.screen === 'loss') {
    drawEndScreen(ctx, game, false);
  } else {
    drawTable(ctx, game, dt);
  }
}
