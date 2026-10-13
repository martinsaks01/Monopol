/*
 * Monopol – grensesnitt.
 *
 * Tegner brettet, spillerpanelet og dialoger, og kobler knapper til spillmotoren.
 * All spillogikk ligger i engine.js; denne fila endrer aldri spilltilstanden direkte.
 */
(function () {
  'use strict';

  const { Game, DEFAULT_RULES, validateTheme } = window.MonopolEngine;
  const AI = window.MonopolAI;

  const SAVE_KEY = 'monopol.save.v1';
  const THEMES_KEY = 'monopol.customThemes.v1';
  const PREFS_KEY = 'monopol.prefs.v1';
  const TOKENS = ['🚗', '🎩', '🐕', '🚢', '🐈', '👢', '✈️', '🦆', '🚲', '🦄'];
  const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#6d4c41'];
  const SPEEDS = {
    slow: { label: 'Sakte', ai: 1300, step: 180, dice: 700 },
    normal: { label: 'Normal', ai: 750, step: 110, dice: 500 },
    fast: { label: 'Rask', ai: 300, step: 55, dice: 300 },
    turbo: { label: 'Lynrask', ai: 60, step: 12, dice: 80 },
  };
  const DEFAULT_ICONS = { start: '🏁', station: '🚂', utility: '⚡', tax: '💰', jail: '🔒', parking: '🅿️', gotojail: '👮' };
  const MAX_PLAYERS = 8;

  let game = null;
  const view = {
    displayPos: [],
    lastMoveId: null,
    lastRollId: null,
    dismissedCard: null,
    busy: false,
    waiting: false,     // venter på et menneske (f.eks. handelsforslag fra AI)
    aiTimer: null,
    openModal: null,    // funksjon som tegner åpen modal på nytt
  };

  // --------------------------------------------------------------- hjelpere

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* fullt eller blokkert */ }
  }

  const prefs = Object.assign({ speed: 'normal', lastSetup: null }, loadJSON(PREFS_KEY, {}));
  const speed = () => SPEEDS[prefs.speed] || SPEEDS.normal;

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.json,application/json';
      input.onchange = () => {
        const f = input.files[0];
        if (!f) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(f);
      };
      input.click();
    });
  }

  const fmt = (n) => (game ? game.fmt(n) : `${n} kr`);

  function allThemes() {
    const builtIn = (window.MONOPOL_THEMES || []).map((t) => Object.assign({ builtIn: true }, t));
    const custom = loadJSON(THEMES_KEY, []);
    return builtIn.concat(custom);
  }

  function groupColor(sq) {
    if (!game || sq.type !== 'property') return '#999';
    const g = game.group(sq.group);
    return g ? g.color : '#999';
  }

  /** Svart eller hvit tekst avhengig av bakgrunnsfargen. */
  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#000';
    const v = parseInt(m[1], 16);
    const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
    return lum > 150 ? '#000' : '#fff';
  }

  function squareIcon(sq) {
    if (sq.icon) return sq.icon;
    if (sq.type === 'card') return (game.s.decks[sq.deck] || {}).icon || '🂠';
    return DEFAULT_ICONS[sq.type] || '';
  }

  // ===================================================================
  // Oppsettskjerm
  // ===================================================================

  const setupState = {
    players: [],
    themeIndex: 0,
    rules: {},
  };

  function defaultPlayers() {
    return [
      { name: 'Spiller 1', isAI: false, token: TOKENS[0], color: COLORS[0] },
      { name: 'Datamaskin 1', isAI: true, token: TOKENS[1], color: COLORS[1] },
      { name: 'Datamaskin 2', isAI: true, token: TOKENS[2], color: COLORS[2] },
    ];
  }

  function showSetup() {
    stopAI();
    game = null;
    $('#game').classList.add('hidden');
    $('#setup').classList.remove('hidden');
    if (!setupState.players.length) {
      const last = prefs.lastSetup;
      setupState.players = last && last.players ? last.players : defaultPlayers();
      setupState.rules = last && last.rules ? last.rules : {};
      setupState.themeId = last && last.themeId;
    }
    renderSetup();
  }

  function currentSetupTheme() {
    const themes = allThemes();
    let idx = themes.findIndex((t) => t.id === setupState.themeId);
    if (idx < 0) idx = 0;
    return themes[idx];
  }

  function renderSetup() {
    const themes = allThemes();
    const theme = currentSetupTheme();
    const rules = Object.assign({}, DEFAULT_RULES, theme.rules || {}, setupState.rules);
    const saved = loadJSON(SAVE_KEY, null);

    const playerRows = setupState.players.map((p, i) => `
      <div class="player-row" data-i="${i}">
        <div class="swatch" style="background:${esc(p.color)};display:flex;align-items:center;justify-content:center">${esc(p.token)}</div>
        <input type="text" data-field="name" value="${esc(p.name)}" maxlength="20" aria-label="Navn">
        <select data-field="isAI" aria-label="Type">
          <option value="0" ${!p.isAI ? 'selected' : ''}>👤 Menneske</option>
          <option value="1" ${p.isAI ? 'selected' : ''}>🤖 Datamaskin</option>
        </select>
        <select data-field="token" aria-label="Brikke">
          ${TOKENS.map((t) => `<option ${t === p.token ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input type="color" data-field="color" value="${esc(p.color)}" aria-label="Farge">
        <button class="icon-btn" data-action="remove-player" title="Fjern" ${setupState.players.length <= 2 ? 'disabled' : ''}>✕</button>
      </div>`).join('');

    $('#setup').innerHTML = `
      <div class="setup-card">
        <h1>MONOPOL</h1>
        <p class="subtitle">Kjøp, bygg, handle – og slå motstanderne konkurs. Spill mot venner på samme skjerm eller mot datamaskinen.</p>

        ${saved ? `<section>
          <button class="btn green big" data-action="continue">▶ Fortsett lagret spill</button>
          <span class="hint">&nbsp; Tur ${saved.turn || '?'} · ${esc(saved.players || '')} · ${saved.savedAt ? new Date(saved.savedAt).toLocaleString('nb-NO') : ''}</span>
        </section>` : ''}

        <section>
          <h2>Spillere</h2>
          <div id="player-rows">${playerRows}</div>
          <button class="btn small" data-action="add-player" ${setupState.players.length >= MAX_PLAYERS ? 'disabled' : ''}>+ Legg til spiller</button>
        </section>

        <section>
          <h2>Tema / brett</h2>
          <div class="theme-row">
            <select id="theme-select">
              ${themes.map((t) => `<option value="${esc(t.id)}" ${t.id === theme.id ? 'selected' : ''}>${esc(t.name)}${t.builtIn ? '' : ' (importert)'}</option>`).join('')}
            </select>
            <button class="btn small" data-action="import-theme">📂 Importer tema</button>
            <button class="btn small" data-action="export-theme">💾 Last ned som JSON</button>
            ${theme.builtIn ? '' : '<button class="btn small" data-action="delete-theme">🗑 Slett</button>'}
          </div>
          <p class="hint">${esc(theme.description || '')} ${theme.board.length} felter, ${Object.keys(theme.decks || {}).length} kortstokker.
          Last ned temaet som JSON, endre felter, priser og kort, og importer det igjen for å lage ditt eget brett.</p>
        </section>

        <section>
          <h2>Regler</h2>
          <div class="rules-grid">
            <label>Startpenger <input type="number" data-rule="startMoney" value="${rules.startMoney}" min="0" step="100"></label>
            <label>Lønn ved Start <input type="number" data-rule="goSalary" value="${rules.goSalary}" min="0" step="50"></label>
            <label>Fengselsbot <input type="number" data-rule="jailFine" value="${rules.jailFine}" min="0" step="10"></label>
            <label>Antall hus i banken <input type="number" data-rule="houses" value="${rules.houses}" min="0" step="1"></label>
            <label class="check"><input type="checkbox" data-rule="auctions" ${rules.auctions ? 'checked' : ''}> Auksjon når en eiendom ikke kjøpes</label>
            <label class="check"><input type="checkbox" data-rule="evenBuild" ${rules.evenBuild ? 'checked' : ''}> Jevn bygging i fargegrupper</label>
            <label class="check"><input type="checkbox" data-rule="freeParkingJackpot" ${rules.freeParkingJackpot ? 'checked' : ''}> Skatter og bøter til potten på Gratis parkering</label>
            <label class="check"><input type="checkbox" data-rule="doubleSalaryOnGo" ${rules.doubleSalaryOnGo ? 'checked' : ''}> Dobbel lønn ved å lande på Start</label>
            <label class="check"><input type="checkbox" data-rule="collectRentInJail" ${rules.collectRentInJail ? 'checked' : ''}> Kan kreve leie mens man sitter i fengsel</label>
          </div>
        </section>

        <div class="setup-actions">
          <button class="btn primary big" data-action="start">🎲 Start nytt spill</button>
          <button class="btn" data-action="load-file">📂 Last inn spill fra fil</button>
        </div>
      </div>`;
  }

  function readSetupForm() {
    $$('#player-rows .player-row').forEach((row) => {
      const p = setupState.players[Number(row.dataset.i)];
      p.name = $('[data-field="name"]', row).value.trim() || p.name;
      p.isAI = $('[data-field="isAI"]', row).value === '1';
      p.token = $('[data-field="token"]', row).value;
      p.color = $('[data-field="color"]', row).value;
    });
    const sel = $('#theme-select');
    if (sel) setupState.themeId = sel.value;
    $$('[data-rule]').forEach((el) => {
      const key = el.dataset.rule;
      setupState.rules[key] = el.type === 'checkbox' ? el.checked : Number(el.value);
    });
  }

  function setupClick(action, el) {
    readSetupForm();
    switch (action) {
      case 'add-player': {
        const used = setupState.players.map((p) => p.token);
        const usedC = setupState.players.map((p) => p.color);
        const n = setupState.players.length + 1;
        setupState.players.push({
          name: `Datamaskin ${n - 1}`,
          isAI: true,
          token: TOKENS.find((t) => !used.includes(t)) || TOKENS[0],
          color: COLORS.find((c) => !usedC.includes(c)) || COLORS[0],
        });
        renderSetup();
        break;
      }
      case 'remove-player': {
        const i = Number(el.closest('.player-row').dataset.i);
        setupState.players.splice(i, 1);
        renderSetup();
        break;
      }
      case 'import-theme':
        pickFile().then((text) => {
          if (!text) return;
          try {
            const t = JSON.parse(text);
            const errors = validateTheme(t);
            if (errors.length) { alert('Temaet har feil:\n\n' + errors.join('\n')); return; }
            t.id = t.id || 'tema-' + Date.now();
            t.name = t.name || 'Importert tema';
            const custom = loadJSON(THEMES_KEY, []).filter((x) => x.id !== t.id);
            custom.push(t);
            saveJSON(THEMES_KEY, custom);
            setupState.themeId = t.id;
            setupState.rules = {};
            renderSetup();
            toast(`Temaet «${t.name}» er importert.`, 'good');
          } catch (e) {
            alert('Kunne ikke lese fila: ' + e.message);
          }
        });
        break;
      case 'export-theme': {
        const t = Object.assign({}, currentSetupTheme());
        delete t.builtIn;
        download(`${t.id || 'tema'}.json`, JSON.stringify(t, null, 2));
        break;
      }
      case 'delete-theme': {
        const t = currentSetupTheme();
        if (!confirm(`Slette temaet «${t.name}»?`)) return;
        saveJSON(THEMES_KEY, loadJSON(THEMES_KEY, []).filter((x) => x.id !== t.id));
        setupState.themeId = null;
        renderSetup();
        break;
      }
      case 'start': {
        const theme = currentSetupTheme();
        prefs.lastSetup = { players: setupState.players, rules: setupState.rules, themeId: theme.id };
        saveJSON(PREFS_KEY, prefs);
        try {
          game = Game.create(theme, setupState.players, setupState.rules);
        } catch (e) {
          alert(e.message);
          return;
        }
        startGameView();
        break;
      }
      case 'continue': {
        const saved = loadJSON(SAVE_KEY, null);
        if (!saved) return;
        try { game = Game.load(saved.data); } catch (e) { alert('Kunne ikke laste spillet: ' + e.message); return; }
        startGameView();
        break;
      }
      case 'load-file':
        pickFile().then((text) => {
          if (!text) return;
          try {
            const data = JSON.parse(text);
            game = Game.load(data.data ? data.data : data);
            startGameView();
          } catch (e) {
            alert('Kunne ikke laste spillet: ' + e.message);
          }
        });
        break;
      default:
        break;
    }
  }

  // ===================================================================
  // Brettet
  // ===================================================================

  function cellPlacement(i, k) {
    // Indeks 0 nede til høyre, deretter mot venstre, opp, mot høyre og ned.
    if (i <= k) return { row: k + 1, col: k + 1 - i, side: 'bottom' };
    if (i <= 2 * k) return { row: k + 1 - (i - k), col: 1, side: 'left' };
    if (i <= 3 * k) return { row: 1, col: 1 + (i - 2 * k), side: 'top' };
    return { row: 1 + (i - 3 * k), col: k + 1, side: 'right' };
  }

  function buildBoard() {
    const s = game.s;
    const n = s.board.length;
    const k = n / 4;
    const board = $('#board');
    const tpl = `1.55fr repeat(${k - 1}, 1fr) 1.55fr`;
    board.style.gridTemplateColumns = tpl;
    board.style.gridTemplateRows = tpl;
    board.innerHTML = '';

    s.board.forEach((sq, i) => {
      const pl = cellPlacement(i, k);
      const corner = i % k === 0;
      const cell = document.createElement('div');
      cell.className = `cell side-${pl.side} type-${sq.type}${corner ? ' corner' : ''}${sq.type === 'property' ? ' has-band' : ''}`;
      cell.id = `cell-${i}`;
      cell.dataset.sq = i;
      cell.style.gridRow = pl.row;
      cell.style.gridColumn = pl.col;
      let inner = '';
      if (sq.type === 'property') {
        inner += `<div class="band" style="background:${esc(groupColor(sq))}"></div>`;
        inner += `<div class="cell-name">${esc(sq.name)}</div><div class="cell-price">${fmt(sq.price)}</div>`;
      } else if (corner) {
        inner += `<div class="cell-icon">${squareIcon(sq)}</div><div class="cell-name">${esc(sq.name)}</div>`;
      } else {
        inner += `<div class="cell-name">${esc(sq.name)}</div><div class="cell-icon">${squareIcon(sq)}</div>`;
        if (sq.price) inner += `<div class="cell-price">${fmt(sq.price)}</div>`;
        else if (sq.type === 'tax') inner += `<div class="cell-price">Betal ${fmt(sq.amount)}</div>`;
      }
      inner += `<div class="tokens"></div>`;
      cell.innerHTML = inner;
      board.appendChild(cell);
    });

    const center = document.createElement('div');
    center.id = 'center';
    center.style.gridRow = `2 / span ${k - 1}`;
    center.style.gridColumn = `2 / span ${k - 1}`;
    board.appendChild(center);
  }

  function updateBoard() {
    const s = game.s;
    s.board.forEach((sq, i) => {
      const cell = $(`#cell-${i}`);
      if (!cell) return;
      const pr = s.props[i];
      const old = $('.owner-bar', cell);
      if (old) old.remove();
      cell.classList.toggle('mortgaged', !!(pr && pr.mortgaged));
      if (pr && pr.owner !== null) {
        const bar = document.createElement('div');
        bar.className = 'owner-bar';
        bar.style.setProperty('--owner', game.player(pr.owner).color);
        cell.appendChild(bar);
      }
      const band = $('.band', cell);
      if (band) {
        band.innerHTML = pr && pr.houses === 5 ? '<div class="hotel"></div>'
          : pr ? '<div class="house"></div>'.repeat(pr.houses) : '';
      }
      cell.classList.toggle('highlight', !!((s.phase === 'buy' && s.pendingBuy === i) || (s.auction && s.auction.square === i)));
    });
    renderTokens();
  }

  function renderTokens() {
    $$('.tokens').forEach((t) => { t.innerHTML = ''; });
    const s = game.s;
    s.players.forEach((p) => {
      if (p.bankrupt) return;
      const pos = view.displayPos[p.id] != null ? view.displayPos[p.id] : p.position;
      const el = $(`#cell-${pos} .tokens`);
      if (!el) return;
      const tok = document.createElement('div');
      tok.className = 'token' + (p.id === s.current ? ' active' : '') + (p.inJail ? ' jailed' : '');
      tok.style.setProperty('--pcolor', p.color);
      tok.title = p.name;
      tok.innerHTML = `<span>${esc(p.token)}</span>`;
      el.appendChild(tok);
    });
  }

  // ===================================================================
  // Midtpanelet
  // ===================================================================

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(v, rolling) {
    const on = PIPS[v] || [];
    let pips = '';
    for (let k = 0; k < 9; k++) pips += `<div class="pip${on.includes(k) ? ' on' : ''}"></div>`;
    return `<div class="die${rolling ? ' rolling' : ''}">${pips}</div>`;
  }

  function isHumanTurn() {
    const id = game.actingPlayerId();
    return id !== null && !game.player(id).isAI;
  }

  function renderCenter() {
    const s = game.s;
    const center = $('#center');
    if (!center) return;
    const actingId = game.actingPlayerId();
    const acting = actingId !== null ? game.player(actingId) : null;
    const cur = game.current;
    const human = acting && !acting.isAI;
    const dice = s.dice || [1, 1];

    let html = `<div class="center-inner">
      <div class="logo">MONOPOL</div>
      <div class="theme-name">${esc(s.theme.name || '')}</div>`;

    if (s.phase !== 'gameover') {
      const sub = cur.inJail ? 'sitter i fengsel' : s.phase === 'roll' && s.doublesCount > 0 ? 'slo dobbel – kast igjen!' : 'sin tur';
      html += `<div class="turn-banner" style="--pcolor:${esc(cur.color)}"><span class="tok">${esc(cur.token)}</span>
        <span>${esc(cur.name)} <span class="sub">${sub}</span></span><span class="sub">· ${fmt(cur.money)}</span></div>`;
    }

    html += `<div class="dice" id="dice">${dieHTML(dice[0])}${dieHTML(dice[1])}</div>`;

    if (s.lastCard && view.dismissedCard !== s.lastCard.id) {
      const c = s.lastCard;
      html += `<div class="drawn-card">
        <div class="head" style="background:${esc(c.color)}"><span>${esc(c.icon || '')} ${esc(c.deckName)}</span><span>${esc(game.player(c.player).name)}</span></div>
        <div class="body">${esc(c.text)}</div>
        <div class="foot"><button class="btn small" data-action="dismiss-card">OK</button></div>
      </div>`;
    }

    html += renderPhase(acting, human);

    if (s.rules.freeParkingJackpot) html += `<div class="pot">🅿️ Potten: ${fmt(s.pot)}</div>`;
    const recent = s.log.slice(-4).map((l) => `<div>${esc(l.msg)}</div>`).join('');
    html += `<div class="recent">${recent}</div></div>`;
    center.innerHTML = html;
  }

  function secondaryButtons(pid) {
    return `<button class="btn small dark" data-action="manage" data-pid="${pid}">🏠 Eiendommer</button>
            <button class="btn small dark" data-action="trade" data-pid="${pid}">🤝 Handel</button>`;
  }

  function renderPhase(acting, human) {
    const s = game.s;
    const cur = game.current;
    const thinking = acting && acting.isAI ? `<div class="thinking">🤖 ${esc(acting.name)} tenker …</div>` : '';

    switch (s.phase) {
      case 'roll': {
        if (!human) return thinking;
        if (cur.inJail) {
          return `<div class="status-text">Du sitter i fengsel (forsøk ${cur.jailTurns + 1} av ${s.rules.maxJailTurns}).</div>
            <div class="actions">
              <button class="btn primary" data-action="roll">🎲 Prøv å slå dobbel</button>
              <button class="btn blue" data-action="pay-jail" ${cur.money < s.rules.jailFine ? 'disabled' : ''}>Betal ${fmt(s.rules.jailFine)}</button>
              ${cur.jailCards.length ? `<button class="btn green" data-action="jail-card">Bruk kort (${cur.jailCards.length})</button>` : ''}
            </div>
            <div class="actions">${secondaryButtons(cur.id)}</div>`;
        }
        return `<div class="actions"><button class="btn primary big" data-action="roll">🎲 Kast terningene</button></div>
          <div class="actions">${secondaryButtons(cur.id)}</div>`;
      }
      case 'buy': {
        const sq = s.board[s.pendingBuy];
        if (!human) return `<div class="status-text">${esc(cur.name)} vurderer å kjøpe ${esc(sq.name)}.</div>${thinking}`;
        const can = cur.money >= sq.price;
        return `<div class="status-text">${esc(sq.name)} er til salgs for ${fmt(sq.price)}.</div>
          <div class="actions">
            <button class="btn green big" data-action="buy" ${can ? '' : 'disabled'}>Kjøp for ${fmt(sq.price)}</button>
            <button class="btn" data-action="decline">${s.rules.auctions ? '🔨 Send på auksjon' : 'Ikke kjøp'}</button>
            <button class="btn small" data-action="deed" data-sq="${s.pendingBuy}">Se skjøte</button>
          </div>
          ${can ? '' : '<div class="status-text warn">Du har ikke nok penger. Pantsett eller selg for å skaffe mer.</div>'}
          <div class="actions">${secondaryButtons(cur.id)}</div>`;
      }
      case 'auction': return renderAuction(acting, human, thinking);
      case 'debt': {
        const d = s.debts[0];
        const debtor = game.player(d.debtor);
        const to = typeof d.to === 'number' ? game.player(d.to).name : d.to === 'pot' ? 'potten' : 'banken';
        const missing = d.amount - debtor.money;
        if (!human) return `<div class="status-text warn">${esc(debtor.name)} skylder ${fmt(d.amount)} til ${esc(to)}.</div>${thinking}`;
        return `<div class="status-text warn">${esc(debtor.name)}: du skylder ${fmt(d.amount)} til ${esc(to)}${d.reason ? ` (${esc(d.reason)})` : ''}.</div>
          <div class="status-text">${missing > 0 ? `Du mangler ${fmt(missing)}. Pantsett eiendommer, selg hus eller handle for å skaffe penger.` : 'Du har nok penger nå.'}</div>
          <div class="actions">
            <button class="btn green" data-action="pay-debt" ${missing > 0 ? 'disabled' : ''}>Betal ${fmt(d.amount)}</button>
            <button class="btn primary" data-action="bankrupt">Erklær konkurs</button>
          </div>
          <div class="actions">${secondaryButtons(debtor.id)}</div>`;
      }
      case 'end': {
        if (!human) return thinking;
        return `<div class="actions"><button class="btn blue big" data-action="end-turn">Avslutt tur ➜</button></div>
          <div class="actions">${secondaryButtons(cur.id)}</div>`;
      }
      case 'gameover': {
        const w = s.winner !== null ? game.player(s.winner) : null;
        return `<div class="status-text" style="font-size:1.4em">🏆 ${w ? esc(w.name) + ' har vunnet!' : 'Spillet er over.'}</div>
          <div class="actions"><button class="btn primary" data-action="new-game">Nytt spill</button>
          <button class="btn" data-action="show-results">Resultater</button></div>`;
      }
      default:
        return '';
    }
  }

  function renderAuction(acting, human, thinking) {
    const s = game.s, a = s.auction;
    const sq = s.board[a.square];
    const bidders = s.players.filter((p) => !p.bankrupt).map((p) => {
      const inIt = a.participants.includes(p.id);
      const turn = acting && p.id === acting.id;
      return `<span class="${turn ? 'turn' : ''} ${inIt ? '' : 'out'}">${esc(p.token)} ${esc(p.name)}</span>`;
    }).join('');
    let controls = thinking;
    if (human) {
      const min = a.highBid + 1;
      const quick = [10, 50, 100].map((inc) => a.highBid + inc)
        .map((v) => `<button class="btn small green" data-action="bid" data-amount="${v}" ${v > acting.money ? 'disabled' : ''}>${fmt(v)}</button>`).join('');
      controls = `<div class="status-text">${esc(acting.name)}, ditt bud (du har ${fmt(acting.money)}):</div>
        <div class="bid-row">${quick}
          <input type="number" id="bid-input" min="${min}" step="10" value="${Math.max(min, Math.min(acting.money, a.highBid + 10))}">
          <button class="btn small blue" data-action="bid-custom">By</button>
          <button class="btn small" data-action="pass">Stå over</button>
        </div>`;
    }
    return `<div class="auction">
      <h4>🔨 Auksjon: ${esc(sq.name)} <span class="hint">(verdi ${fmt(sq.price)})</span></h4>
      <div>Høyeste bud: <b>${a.highBidder !== null ? `${fmt(a.highBid)} – ${esc(game.player(a.highBidder).name)}` : 'ingen bud ennå'}</b></div>
      <div class="bidders">${bidders}</div>
      ${controls}
    </div>`;
  }

  // ===================================================================
  // Sidepanel
  // ===================================================================

  function renderPlayers() {
    const s = game.s;
    const acting = game.actingPlayerId();
    $('#turn-counter').textContent = `Tur ${s.turn} · Hus i banken: ${s.houses} · Hoteller: ${s.hotels}`;
    $('#players').innerHTML = s.players.map((p) => {
      const owned = game.ownedBy(p.id).sort((a, b) => a - b);
      const chips = owned.map((i) => {
        const sq = s.board[i], pr = s.props[i];
        const bg = sq.type === 'property' ? groupColor(sq) : '#fff';
        const label = pr.houses === 5 ? 'H' : pr.houses || (sq.type === 'property' ? '' : squareIcon(sq));
        return `<div class="chip${sq.type !== 'property' ? ' icon' : ''}${pr.mortgaged ? ' mortgaged' : ''}" style="background:${esc(bg)}" data-action="deed" data-sq="${i}" title="${esc(sq.name)}${pr.mortgaged ? ' (pantsatt)' : ''}">${label}</div>`;
      }).join('');
      const badges = [];
      if (p.isAI) badges.push('<span class="badge ai">🤖 AI</span>');
      if (p.inJail) badges.push('<span class="badge jail">🔒 Fengsel</span>');
      if (p.jailCards.length) badges.push(`<span class="badge">🎫 ${p.jailCards.length}</span>`);
      if (p.bankrupt) badges.push('<span class="badge">Konkurs</span>');
      return `<div class="pcard${p.id === acting || (acting === null && p.id === s.winner) ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}" style="--pcolor:${esc(p.color)}">
        <div class="row1"><span class="tok">${esc(p.token)}</span><span class="name">${esc(p.name)}</span><span class="money">${fmt(p.money)}</span></div>
        <div class="meta">${badges.join('')}<span>Formue: ${fmt(game.netWorth(p.id))}</span></div>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderLog() {
    const entries = game.s.log.slice(-120).reverse();
    $('#log').innerHTML = entries.map((l) => `<div class="${l.msg.startsWith('—') ? 'turn' : ''}">${esc(l.msg)}</div>`).join('');
  }

  function render() {
    if (!game) return;
    updateBoard();
    renderCenter();
    renderPlayers();
    renderLog();
    if (view.openModal) view.openModal();
  }

  // ===================================================================
  // Animasjoner og spill-løkke
  // ===================================================================

  async function animateDice() {
    const el = $('#dice');
    const sp = speed();
    if (!el || sp.dice < 100) return;
    const end = Date.now() + sp.dice;
    while (Date.now() < end) {
      el.innerHTML = dieHTML(1 + Math.floor(Math.random() * 6), true) + dieHTML(1 + Math.floor(Math.random() * 6), true);
      await sleep(70);
    }
  }

  async function animateMove() {
    const s = game.s, m = s.lastMove;
    const p = game.player(m.player);
    const n = s.board.length;
    let pos = view.displayPos[p.id] != null ? view.displayPos[p.id] : m.from;
    if (m.jail || m.steps <= 0) { view.displayPos[p.id] = p.position; return; }
    const dist = (p.position - pos + n) % n;
    const stepMs = speed().step;
    for (let k = 0; k < dist; k++) {
      pos = (pos + 1) % n;
      view.displayPos[p.id] = pos;
      renderTokens();
      await sleep(stepMs);
    }
  }

  function syncPositions() {
    game.s.players.forEach((p) => { view.displayPos[p.id] = p.position; });
  }

  function save() {
    if (!game) return;
    saveJSON(SAVE_KEY, {
      savedAt: Date.now(),
      turn: game.s.turn,
      players: game.s.players.map((p) => p.name).join(', '),
      data: game.s,
    });
  }

  /** Kalles etter hver handling: lagre, animer og tegn på nytt. */
  async function refresh() {
    if (!game) return;
    view.busy = true;
    try {
      save();
      const s = game.s;
      if (s.rollId !== view.lastRollId) {
        view.lastRollId = s.rollId;
        await animateDice();
      }
      if (s.lastMove && s.lastMove.id !== view.lastMoveId) {
        view.lastMoveId = s.lastMove.id;
        await animateMove();
      }
      syncPositions();
      render();
      if (s.phase === 'gameover' && !view.shownGameOver) {
        view.shownGameOver = true;
        showResults();
      }
    } finally {
      view.busy = false;
    }
    scheduleAI();
  }

  function stopAI() {
    if (view.aiTimer) clearTimeout(view.aiTimer);
    view.aiTimer = null;
  }

  function scheduleAI() {
    stopAI();
    if (!game || game.s.phase === 'gameover' || view.waiting) return;
    const id = game.actingPlayerId();
    if (id === null || !game.player(id).isAI) return;
    view.aiTimer = setTimeout(runAI, speed().ai);
  }

  function runAI() {
    view.aiTimer = null;
    if (!game || view.busy || view.waiting) return;
    let result;
    try {
      result = AI.step(game);
    } catch (e) {
      console.error(e);
      toast('Feil i datamotstanderen: ' + e.message, 'bad');
      return;
    }
    if (result && result.type === 'proposeTrade') {
      handleProposal(result.offer);
      return;
    }
    refresh();
  }

  /** Gjør en handling for et menneske og vis feilmelding hvis den ikke er lov. */
  function act(fn) {
    if (!game || view.busy) return;
    const res = fn();
    if (res && !res.ok) { toast(res.error, 'bad'); return; }
    refresh();
  }

  /** På smale skjermer tegnes brettet i fast størrelse og skaleres ned. */
  function fitBoard() {
    const wrap = $('#board-wrap');
    if (!wrap) return;
    const minSize = 560;
    const avail = window.innerWidth - 16;
    if (window.innerWidth <= 1000 && avail < minSize) {
      wrap.style.zoom = String(avail / minSize);
      $('#board').style.setProperty('--board-size', minSize + 'px');
    } else {
      wrap.style.zoom = '';
      $('#board').style.removeProperty('--board-size');
    }
  }
  window.addEventListener('resize', fitBoard);

  function startGameView() {
    $('#setup').classList.add('hidden');
    $('#game').classList.remove('hidden');
    view.displayPos = [];
    view.lastMoveId = game.s.lastMove ? game.s.lastMove.id : null;
    view.lastRollId = game.s.rollId;
    view.dismissedCard = null;
    view.shownGameOver = game.s.phase === 'gameover';
    view.waiting = false;
    closeModal();
    buildBoard();
    fitBoard();
    syncPositions();
    refresh();
  }

  // ===================================================================
  // Modaler
  // ===================================================================

  function showModal(html, opts) {
    opts = opts || {};
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-overlay"><div class="modal ${opts.cls || ''}">
      ${opts.noClose ? '' : '<button class="icon-btn close" data-action="close-modal" title="Lukk">✕</button>'}
      ${html}</div></div>`;
    const overlay = $('.modal-overlay', root);
    if (!opts.noClose) {
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
    }
    return $('.modal', root);
  }

  function closeModal() {
    $('#modal-root').innerHTML = '';
    view.openModal = null;
  }

  function updateModal(html) {
    const m = $('#modal-root .modal');
    if (!m) return;
    const close = m.querySelector('.close');
    m.innerHTML = (close ? close.outerHTML : '') + html;
  }

  // ---------------------------------------------------- skjøte / eiendomskort

  function deedHTML(i) {
    const s = game.s, sq = s.board[i], pr = s.props[i];
    if (!pr) {
      let desc = '';
      if (sq.type === 'tax') desc = `Betal ${fmt(sq.amount)}.`;
      else if (sq.type === 'card') desc = `Trekk et kort fra «${esc((s.decks[sq.deck] || {}).name)}».`;
      else if (sq.type === 'start') desc = `Motta ${fmt(s.rules.goSalary)} hver gang du passerer.`;
      else if (sq.type === 'jail') desc = `Bare på besøk – eller sitt inne. Betal ${fmt(s.rules.jailFine)}, bruk et kort eller slå dobbel for å komme ut.`;
      else if (sq.type === 'gotojail') desc = 'Gå direkte i fengsel. Du passerer ikke Start.';
      else if (sq.type === 'parking') desc = s.rules.freeParkingJackpot ? `Vinn potten (nå ${fmt(s.pot)}).` : 'Ta en pause. Ingenting skjer.';
      return `<div class="deed"><div class="deed-head" style="background:#eee"><div style="font-size:2em">${squareIcon(sq)}</div><b>${esc(sq.name)}</b></div>
        <div class="deed-foot">${desc}</div></div>`;
    }
    let rows = '';
    let head;
    if (sq.type === 'property') {
      const g = game.group(sq.group);
      head = `<div class="deed-head" style="background:${esc(g.color)};color:${textOn(g.color)}"><small>Skjøte</small><b>${esc(sq.name)}</b></div>`;
      const mono = pr.owner !== null && game.ownsGroup(pr.owner, sq.group);
      const labels = ['Leie', 'Med 1 hus', 'Med 2 hus', 'Med 3 hus', 'Med 4 hus', 'Med hotell'];
      sq.rent.forEach((r, k) => {
        rows += `<tr class="${pr.owner !== null && !pr.mortgaged && pr.houses === k && !(k === 0 && mono) ? 'cur' : ''}"><td>${labels[k]}</td><td>${fmt(r)}</td></tr>`;
        if (k === 0) rows += `<tr class="${mono && pr.houses === 0 && !pr.mortgaged ? 'cur' : ''}"><td>Hele fargegruppen</td><td>${fmt(r * s.rules.monopolyRentMultiplier)}</td></tr>`;
      });
      rows += `<tr><td colspan="2"><hr></td></tr><tr><td>Hus koster</td><td>${fmt(game.houseCost(i))}</td></tr><tr><td>Hotell koster</td><td>${fmt(game.houseCost(i))} + 4 hus</td></tr>`;
    } else if (sq.type === 'station') {
      head = `<div class="deed-head" style="background:#eee"><div style="font-size:2em">${squareIcon(sq)}</div><b>${esc(sq.name)}</b></div>`;
      const table = sq.rent || s.rules.stationRent;
      const n = pr.owner !== null ? game.countOwnedOfType(pr.owner, 'station') : 0;
      table.forEach((r, k) => { rows += `<tr class="${n === k + 1 && !pr.mortgaged ? 'cur' : ''}"><td>Eier ${k + 1} stasjon${k ? 'er' : ''}</td><td>${fmt(r)}</td></tr>`; });
    } else {
      head = `<div class="deed-head" style="background:#eee"><div style="font-size:2em">${squareIcon(sq)}</div><b>${esc(sq.name)}</b></div>`;
      const table = sq.rent || s.rules.utilityMultipliers;
      const n = pr.owner !== null ? game.countOwnedOfType(pr.owner, 'utility') : 0;
      table.forEach((r, k) => { rows += `<tr class="${n === k + 1 && !pr.mortgaged ? 'cur' : ''}"><td>Eier ${k + 1} verk</td><td>${r} × terningene</td></tr>`; });
    }
    return `<div class="deed">${head}<table>${rows}</table>
      <div class="deed-foot">Pris: ${fmt(sq.price)} · Pantverdi: ${fmt(game.mortgageValue(i))}<br>Innløsning: ${fmt(game.unmortgageCost(i))}</div></div>
      <div class="deed-owner">${pr.owner !== null ? `Eier: ${esc(game.player(pr.owner).token)} ${esc(game.player(pr.owner).name)}${pr.mortgaged ? ' – <span style="color:#b91c1c">pantsatt</span>' : ''}${pr.houses ? ` – ${pr.houses === 5 ? 'hotell' : pr.houses + ' hus'}` : ''}` : 'Til salgs hos banken'}</div>`;
  }

  function openDeed(i) {
    const draw = () => {
      const pr = game.s.props[i];
      const actor = game.actingPlayerId();
      let buttons = '';
      if (pr && actor !== null && pr.owner === actor && !game.player(actor).isAI) {
        buttons = `<div class="modal-actions" style="justify-content:center">${propertyButtons(actor, i)}</div>`;
      }
      return deedHTML(i) + buttons;
    };
    showModal(draw());
    view.openModal = () => updateModal(draw());
  }

  function propertyButtons(pid, i) {
    const s = game.s, sq = s.board[i], pr = s.props[i];
    const b = [];
    if (sq.type === 'property' && game.ownsGroup(pid, sq.group)) {
      const be = game.canBuild(pid, i);
      b.push(`<button class="btn small green" data-action="build" data-sq="${i}" ${be ? `disabled title="${esc(be)}"` : ''}>+ ${pr.houses === 4 ? 'Hotell' : 'Hus'} (${fmt(game.houseCost(i))})</button>`);
      if (pr.houses > 0) {
        const se = game.canSellBuilding(pid, i);
        b.push(`<button class="btn small" data-action="sell" data-sq="${i}" ${se ? `disabled title="${esc(se)}"` : ''}>− Selg ${pr.houses === 5 ? 'hotell' : 'hus'} (+${fmt(game.buildingSellValue(i))})</button>`);
      }
    }
    if (pr.mortgaged) {
      const ue = game.canUnmortgage(pid, i);
      b.push(`<button class="btn small blue" data-action="unmortgage" data-sq="${i}" ${ue ? `disabled title="${esc(ue)}"` : ''}>Innløs (−${fmt(game.unmortgageCost(i))})</button>`);
    } else {
      const me = game.canMortgage(pid, i);
      b.push(`<button class="btn small" data-action="mortgage" data-sq="${i}" ${me ? `disabled title="${esc(me)}"` : ''}>Pantsett (+${fmt(game.mortgageValue(i))})</button>`);
    }
    return b.join('');
  }

  // ------------------------------------------------------ eiendomsoversikt

  function openManage(pid) {
    const draw = () => {
      const s = game.s, p = game.player(pid);
      const owned = game.ownedBy(pid).sort((a, b) => a - b);
      if (!owned.length) return `<h2>${esc(p.token)} ${esc(p.name)} sine eiendommer</h2><p>Du eier ingen eiendommer ennå.</p>`;
      const groups = {};
      owned.forEach((i) => {
        const sq = s.board[i];
        const key = sq.type === 'property' ? sq.group : sq.type;
        (groups[key] = groups[key] || []).push(i);
      });
      let html = `<h2>${esc(p.token)} ${esc(p.name)} sine eiendommer</h2>
        <p class="hint">Kontanter: <b>${fmt(p.money)}</b> · Formue: ${fmt(game.netWorth(pid))} · Hus i banken: ${s.houses} · Hoteller: ${s.hotels}</p>`;
      Object.entries(groups).forEach(([key, list]) => {
        const g = game.group(key);
        const title = g ? `${g.name}${game.ownsGroup(pid, key) ? ' ✔ hele gruppen' : ` (${list.length}/${game.groupSquares(key).length})`}`
          : key === 'station' ? 'Stasjoner' : key === 'utility' ? 'Verk' : key;
        html += `<div class="manage-group"><h4><span class="sw" style="background:${g ? esc(g.color) : '#ccc'}"></span>${esc(title)}</h4>`;
        list.forEach((i) => {
          const pr = s.props[i];
          const st = [pr.houses === 5 ? 'Hotell' : pr.houses ? `${pr.houses} hus` : '', pr.mortgaged ? 'Pantsatt' : `Leie ${fmt(game.calcRent(i, 7))}${s.board[i].type === 'utility' ? ' (ved 7)' : ''}`].filter(Boolean).join(' · ');
          html += `<div class="manage-row"><span class="nm" data-action="deed" data-sq="${i}">${esc(s.board[i].name)}</span>
            <span class="st">${st}</span><span class="btns">${propertyButtons(pid, i)}</span></div>`;
        });
        html += '</div>';
      });
      return html;
    };
    showModal(draw(), { cls: 'wide' });
    view.openModal = () => updateModal(draw());
  }

  // --------------------------------------------------------------- handel

  function openTrade(fromId, toId) {
    const s = game.s;
    const others = game.activePlayers().filter((p) => p.id !== fromId);
    if (!others.length) return;
    const draft = { from: fromId, to: toId != null ? toId : others[0].id, giveProps: [], getProps: [], giveMoney: 0, getMoney: 0, giveCards: 0, getCards: 0 };

    const list = (pid, chosen, side) => {
      const owned = game.ownedBy(pid).sort((a, b) => a - b);
      if (!owned.length) return '<div class="hint">Ingen eiendommer.</div>';
      return owned.map((i) => {
        const sq = s.board[i], pr = s.props[i];
        const blocked = sq.type === 'property' && game.groupHasBuildings(sq.group);
        return `<label class="trade-item${blocked ? ' disabled' : ''}" title="${blocked ? 'Selg bygningene i gruppen først' : ''}">
          <input type="checkbox" data-trade="${side}" value="${i}" ${chosen.includes(i) ? 'checked' : ''} ${blocked ? 'disabled' : ''}>
          <span class="sw" style="background:${sq.type === 'property' ? esc(groupColor(sq)) : '#ddd'}"></span>
          ${esc(sq.name)} <span class="hint">${fmt(sq.price)}${pr.mortgaged ? ' · pantsatt' : ''}</span></label>`;
      }).join('');
    };

    const draw = () => {
      const a = game.player(draft.from), b = game.player(draft.to);
      return `<h2>🤝 Handel</h2>
        <div class="trade-field">Handle med:
          <select id="trade-partner">${others.map((o) => `<option value="${o.id}" ${o.id === draft.to ? 'selected' : ''}>${esc(o.token)} ${esc(o.name)}${o.isAI ? ' (AI)' : ''}</option>`).join('')}</select>
        </div>
        <div class="trade-cols" style="margin-top:12px">
          <div class="trade-col"><h3>${esc(a.token)} ${esc(a.name)} gir</h3>
            <div class="trade-list">${list(a.id, draft.giveProps, 'give')}</div>
            <div class="trade-field">Penger: <input type="number" id="trade-give-money" min="0" max="${a.money}" step="10" value="${draft.giveMoney}"> <span class="hint">av ${fmt(a.money)}</span></div>
            ${a.jailCards.length ? `<div class="trade-field">Fengselskort: <input type="number" id="trade-give-cards" min="0" max="${a.jailCards.length}" value="${draft.giveCards}"></div>` : ''}
          </div>
          <div class="trade-col"><h3>${esc(b.token)} ${esc(b.name)} gir</h3>
            <div class="trade-list">${list(b.id, draft.getProps, 'get')}</div>
            <div class="trade-field">Penger: <input type="number" id="trade-get-money" min="0" max="${b.money}" step="10" value="${draft.getMoney}"> <span class="hint">av ${fmt(b.money)}</span></div>
            ${b.jailCards.length ? `<div class="trade-field">Fengselskort: <input type="number" id="trade-get-cards" min="0" max="${b.jailCards.length}" value="${draft.getCards}"></div>` : ''}
          </div>
        </div>
        <div class="error" id="trade-error"></div>
        <div class="modal-actions">
          <button class="btn" data-action="close-modal">Avbryt</button>
          <button class="btn primary" data-action="trade-propose">Foreslå handel</button>
        </div>`;
    };

    const readDraft = () => {
      const m = $('#modal-root .modal');
      draft.giveProps = $$('input[data-trade="give"]:checked', m).map((x) => Number(x.value));
      draft.getProps = $$('input[data-trade="get"]:checked', m).map((x) => Number(x.value));
      draft.giveMoney = Math.max(0, Math.floor(Number(($('#trade-give-money', m) || {}).value) || 0));
      draft.getMoney = Math.max(0, Math.floor(Number(($('#trade-get-money', m) || {}).value) || 0));
      draft.giveCards = Math.max(0, Math.floor(Number(($('#trade-give-cards', m) || {}).value) || 0));
      draft.getCards = Math.max(0, Math.floor(Number(($('#trade-get-cards', m) || {}).value) || 0));
    };

    showModal(draw(), { cls: 'wide' });
    view.openModal = null; // handelsvinduet tegnes ikke på nytt automatisk
    view.trade = { draft, draw, readDraft };
  }

  function tradeAction(action) {
    const t = view.trade;
    if (!t) return;
    if (action === 'partner') {
      t.readDraft();
      t.draft.to = Number($('#trade-partner').value);
      t.draft.getProps = [];
      t.draft.getMoney = 0;
      t.draft.getCards = 0;
      updateModal(t.draw());
      return;
    }
    if (action === 'propose') {
      t.readDraft();
      const offer = Object.assign({}, t.draft);
      const err = game.validateTrade(offer);
      if (err) { $('#trade-error').textContent = err; return; }
      const partner = game.player(offer.to);
      if (partner.isAI) {
        const ev = AI.evaluateTrade(game, offer, partner.id);
        if (ev.accept) {
          game.executeTrade(offer);
          closeModal();
          toast(`${partner.name} godtok handelen! 🤝`, 'good');
          view.trade = null;
          refresh();
        } else {
          $('#trade-error').textContent = `${partner.name} avslår. Prøv et bedre tilbud.`;
        }
      } else {
        view.trade = null;
        askHumanAboutTrade(offer, false);
      }
    }
  }

  /** Spør en menneskelig spiller om å godta en handel (hot-seat). */
  function askHumanAboutTrade(offer, fromAI) {
    const a = game.player(offer.from), b = game.player(offer.to);
    const s = game.s;
    const side = (money, props, cards) => {
      const parts = props.map((i) => `<li>${esc(s.board[i].name)}${s.props[i].mortgaged ? ' (pantsatt)' : ''}</li>`);
      if (money) parts.push(`<li>${fmt(money)}</li>`);
      if (cards) parts.push(`<li>${cards} kom-ut-av-fengsel-kort</li>`);
      return parts.length ? `<ul>${parts.join('')}</ul>` : '<p class="hint">ingenting</p>';
    };
    view.waiting = true;
    stopAI();
    showModal(`<h2>🤝 Handelsforslag</h2>
      <p><b>${esc(b.token)} ${esc(b.name)}</b>, ${esc(a.name)} foreslår en handel${fromAI ? '' : ' (gi skjermen til ' + esc(b.name) + ')'}:</p>
      <div class="trade-cols">
        <div class="trade-summary"><b>${esc(a.name)} gir deg:</b>${side(offer.giveMoney, offer.giveProps || [], offer.giveCards)}</div>
        <div class="trade-summary"><b>Du gir ${esc(a.name)}:</b>${side(offer.getMoney, offer.getProps || [], offer.getCards)}</div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-action="trade-reject">Avslå</button>
        <button class="btn green" data-action="trade-accept">Godta</button>
      </div>`, { noClose: true });
    view.pendingOffer = offer;
  }

  function answerTrade(accept) {
    const offer = view.pendingOffer;
    view.pendingOffer = null;
    view.waiting = false;
    closeModal();
    if (!offer) return;
    if (accept) {
      const res = game.executeTrade(offer);
      if (!res.ok) toast(res.error, 'bad');
      else toast('Handelen er gjennomført! 🤝', 'good');
    } else {
      toast(`${game.player(offer.to).name} avslo handelen.`);
      game.log(`${game.player(offer.to).name} avslo et handelsforslag fra ${game.player(offer.from).name}.`);
    }
    refresh();
  }

  function handleProposal(offer) {
    const target = game.player(offer.to);
    if (target.isAI) {
      const ev = AI.evaluateTrade(game, offer, target.id);
      if (ev.accept) {
        game.executeTrade(offer);
        toast(`${game.player(offer.from).name} og ${target.name} har handlet.`);
      }
      refresh();
    } else {
      render();
      askHumanAboutTrade(offer, true);
    }
  }

  // --------------------------------------------------------- meny / resultater

  function openMenu() {
    showModal(`<h2>Meny</h2>
      <div class="trade-field">Hastighet på datamotstandere:
        <select id="speed-select">${Object.entries(SPEEDS).map(([k, v]) => `<option value="${k}" ${prefs.speed === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      </div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn" data-action="show-rules">📜 Regler</button>
        <button class="btn" data-action="export-save">💾 Last ned spillet</button>
        <button class="btn" data-action="end-now">🏁 Avslutt nå (rikeste vinner)</button>
        <button class="btn primary" data-action="new-game">Nytt spill</button>
      </div>
      <p class="hint">Spillet lagres automatisk i nettleseren etter hvert trekk.</p>`);
  }

  function showRules() {
    const r = game.s.rules;
    showModal(`<h2>📜 Regler</h2>
      <ul style="line-height:1.6">
        <li>Alle starter med ${fmt(r.startMoney)}. Du mottar ${fmt(r.goSalary)} hver gang du passerer Start${r.doubleSalaryOnGo ? ', og det dobbelte når du lander rett på' : ''}.</li>
        <li>Kast to terninger og flytt. Slår du dobbel, kaster du igjen – men ${r.doublesToJail} doble på rad sender deg i fengsel.</li>
        <li>Lander du på en ledig eiendom kan du kjøpe den.${r.auctions ? ' Gjør du ikke det, går den på auksjon der alle kan by.' : ''}</li>
        <li>Lander du på andres eiendom betaler du leie. Eier man hele fargegruppen, dobles grunnleien.</li>
        <li>Med hele fargegruppen kan du bygge hus (opptil 4) og deretter hotell${r.evenBuild ? ' – jevnt fordelt i gruppen' : ''}. Banken har ${r.houses} hus og ${r.hotels} hoteller.</li>
        <li>Stasjoner: leien øker med antall stasjoner du eier. Verk: leien er terningsummen × ${r.utilityMultipliers.join(' eller ')}.</li>
        <li>Du kan pantsette eiendommer for halve prisen. Det koster ${Math.round(r.mortgageInterest * 100)} % rente å innløse dem. Pantsatte eiendommer gir ingen leie.</li>
        <li>Fengsel: betal ${fmt(r.jailFine)}, bruk et kort eller prøv å slå dobbel. Etter ${r.maxJailTurns} forsøk må du betale.</li>
        <li>Handle eiendommer, penger og fengselskort med de andre spillerne når som helst i din tur.</li>
        <li>Kan du ikke betale det du skylder, går du konkurs. Siste spiller igjen vinner.</li>
        ${r.freeParkingJackpot ? '<li>Skatter og bøter havner i potten, som vinnes av den som lander på Gratis parkering.</li>' : ''}
      </ul>`);
  }

  function showResults() {
    const s = game.s;
    const ranked = s.players.slice().sort((a, b) => (a.bankrupt - b.bankrupt) || game.netWorth(b.id) - game.netWorth(a.id));
    const w = s.winner !== null ? game.player(s.winner) : null;
    showModal(`<div class="winner"><div class="big">🏆</div>
      <h2>${w ? `${esc(w.token)} ${esc(w.name)} vinner!` : 'Spillet er over'}</h2>
      <p class="hint">Spillet varte i ${s.turn} turer.</p></div>
      <table class="standings">${ranked.map((p, k) => `<tr><td>${k + 1}.</td><td>${esc(p.token)} ${esc(p.name)}</td><td>${p.bankrupt ? 'Konkurs' : fmt(game.netWorth(p.id))}</td></tr>`).join('')}</table>
      <div class="modal-actions"><button class="btn" data-action="close-modal">Se brettet</button><button class="btn primary" data-action="new-game">Nytt spill</button></div>`);
  }

  // ===================================================================
  // Hendelser
  // ===================================================================

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      const cell = e.target.closest('.cell');
      if (cell && game) openDeed(Number(cell.dataset.sq));
      return;
    }
    const action = el.dataset.action;
    if (!game || $('#game').classList.contains('hidden')) {
      setupClick(action, el);
      return;
    }
    const sq = el.dataset.sq != null ? Number(el.dataset.sq) : null;
    const actor = () => game.actingPlayerId();

    switch (action) {
      case 'roll': act(() => game.roll()); break;
      case 'pay-jail': act(() => game.payJailFine()); break;
      case 'jail-card': act(() => game.useJailCard()); break;
      case 'buy': act(() => game.buy()); break;
      case 'decline': act(() => game.declineBuy()); break;
      case 'end-turn': act(() => game.endTurn()); break;
      case 'pay-debt': act(() => game.payDebt()); break;
      case 'bankrupt': {
        const d = game.s.debts[0];
        const p = game.player(d.debtor);
        const canRaise = game.liquidationValue(p.id) >= d.amount;
        const msg = canRaise
          ? `${p.name}, du kan skaffe nok penger ved å selge/pantsette. Vil du likevel gå konkurs?`
          : `${p.name}, vil du erklære deg konkurs?`;
        if (confirm(msg)) act(() => game.declareBankruptcy());
        break;
      }
      case 'bid': act(() => game.auctionBid(actor(), Number(el.dataset.amount))); break;
      case 'bid-custom': act(() => game.auctionBid(actor(), Number($('#bid-input').value))); break;
      case 'pass': act(() => game.auctionPass(actor())); break;
      case 'dismiss-card': view.dismissedCard = game.s.lastCard && game.s.lastCard.id; renderCenter(); break;
      case 'deed': openDeed(sq); break;
      case 'manage': openManage(Number(el.dataset.pid)); break;
      case 'trade': openTrade(Number(el.dataset.pid)); break;
      case 'trade-propose': tradeAction('propose'); break;
      case 'trade-accept': answerTrade(true); break;
      case 'trade-reject': answerTrade(false); break;
      case 'build': act(() => game.build(actor(), sq)); break;
      case 'sell': act(() => game.sellBuilding(actor(), sq)); break;
      case 'mortgage': act(() => game.mortgage(actor(), sq)); break;
      case 'unmortgage': act(() => game.unmortgage(actor(), sq)); break;
      case 'close-modal': closeModal(); view.trade = null; break;
      case 'menu': openMenu(); break;
      case 'show-rules': showRules(); break;
      case 'show-results': showResults(); break;
      case 'export-save': download(`monopol-tur-${game.s.turn}.json`, game.serialize()); break;
      case 'end-now':
        if (confirm('Avslutte spillet nå? Spilleren med høyest formue vinner.')) { closeModal(); act(() => game.endByNetWorth()); }
        break;
      case 'new-game':
        if (game.s.phase === 'gameover' || confirm('Starte et nytt spill? Det nåværende spillet blir ikke lenger lagret.')) {
          if (game.s.phase === 'gameover') { try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignorer */ } }
          closeModal();
          showSetup();
        }
        break;
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'trade-partner') tradeAction('partner');
    if (e.target.id === 'speed-select') {
      prefs.speed = e.target.value;
      saveJSON(PREFS_KEY, prefs);
    }
    if (e.target.id === 'theme-select') {
      readSetupForm();
      setupState.rules = {};
      renderSetup();
    }
    if (e.target.closest && e.target.closest('#player-rows')) {
      readSetupForm();
      renderSetup();
    }
  });

  // Hurtigtaster: mellomrom/Enter utfører hovedhandlingen
  document.addEventListener('keydown', (e) => {
    if (!game || view.busy || $('#modal-root').innerHTML) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (!isHumanTurn()) return;
    const primary = $('#center [data-action="roll"], #center [data-action="end-turn"], #center [data-action="buy"]:not(:disabled)');
    if (primary) { e.preventDefault(); primary.click(); }
  });

  // Oppstart
  showSetup();

  // Eksponer for feilsøking i konsollen
  window.monopol = { get game() { return game; } };
})();
