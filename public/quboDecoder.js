/**
 * QUBO Decoder — Decode an ORBIT optimal state (bit string) into a terminal
 * gate allocation visualisation for a single 4-hour window on one terminal.
 *
 * Includes a hardcoded menu for Window 4 Terminal 2 (08:00–12:00) with
 * 29 events and 1003 variables, so only the optimal state vector is needed.
 *
 * Usage in HTML:
 *   <div id="terminal"></div>
 *   <script src="quboDecoder.js"></script>
 *   <script>
 *     // With hardcoded W4 T2 menu — just pass the 1003-element state:
 *     var decoded = QuboDecoder.decode(state);
 *     QuboDecoder.render(decoded, document.getElementById('terminal'));
 *
 *     // Or with a custom menu:
 *     var decoded = QuboDecoder.decodeState(state, menu);
 *     QuboDecoder.render(decoded, document.getElementById('terminal'));
 *   </script>
 */
var QuboDecoder = (function () {
  'use strict';

  // ── Styles (injected once) ─────────────────────────────────────────────

  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css = [
      '.qd-terminal { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.02); padding: 12px; font-family: system-ui, -apple-system, sans-serif; color: #fff; }',
      '.qd-terminal * { box-sizing: border-box; }',
      '.qd-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }',
      '.qd-header-title { font-size: 14px; font-weight: 600; color: #fff; }',
      '.qd-header-count { font-size: 10px; font-family: monospace; color: rgba(255,255,255,0.5); }',
      '.qd-section-label { font-size: 9px; font-family: system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }',
      '.qd-section-label-contact { color: rgba(34,211,238,0.7); }',
      '.qd-section-label-remote { color: rgba(251,191,36,0.7); }',
      '.qd-section { margin-bottom: 8px; }',
      '.qd-stands { display: flex; flex-wrap: wrap; gap: 3px; }',
      '.qd-stand { width: 38px; height: 26px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.03); padding: 1px 2px; text-align: center; transition: all 0.2s; }',
      '.qd-stand-id { font-size: 7px; font-family: monospace; line-height: 1.2; color: rgba(255,255,255,0.5); }',
      '.qd-stand-tail { font-size: 6px; font-family: monospace; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.qd-stand-tail-empty { visibility: hidden; }',
      /* Contact occupied */
      '.qd-stand-contact-occ { border-color: rgba(34,211,238,0.5); background: rgba(34,211,238,0.15); }',
      '.qd-stand-contact-occ .qd-stand-id { color: #22d3ee; }',
      '.qd-stand-contact-occ .qd-stand-tail { color: #fff; }',
      /* Remote occupied */
      '.qd-stand-remote-occ { border-color: rgba(251,191,36,0.5); background: rgba(251,191,36,0.1); }',
      '.qd-stand-remote-occ .qd-stand-id { color: #fbbf24; }',
      '.qd-stand-remote-occ .qd-stand-tail { color: #fde68a; }',
      /* Time display */
      '.qd-time-bar { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 10px; }',
      '.qd-time-display { font-family: monospace; font-size: 18px; font-weight: 600; color: #22d3ee; min-width: 56px; text-align: right; }',
      '.qd-slider { flex: 1; height: 4px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.1); border-radius: 2px; cursor: pointer; outline: none; }',
      '.qd-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #22d3ee; cursor: pointer; }',
      '.qd-btn { padding: 4px 12px; font-size: 11px; font-family: system-ui, sans-serif; font-weight: 600; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s; }',
      '.qd-btn:hover { color: #fff; border-color: rgba(34,211,238,0.5); }',
      '.qd-btn-speed { color: #22d3ee; }',
      '.qd-unassigned { margin-top: 8px; font-size: 11px; color: rgba(239,68,68,0.7); font-family: system-ui, sans-serif; }',
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Decoder ──────────────────────────────────────────────────────────────

  function decodeState(state, menu) {
    var varsByEvent = {};
    menu.variables.forEach(function (v) {
      if (!varsByEvent[v.eventId]) varsByEvent[v.eventId] = [];
      varsByEvent[v.eventId].push(v);
    });

    var eventMap = {};
    menu.events.forEach(function (ev) { eventMap[ev.eventId] = ev; });

    var sortedEventIds = Object.keys(varsByEvent).sort(function (a, b) {
      return (eventMap[a] ? eventMap[a].start : 0) - (eventMap[b] ? eventMap[b].start : 0);
    });

    var occupied = {};

    function isBlocked(standId, start, end) {
      var occs = occupied[standId];
      if (!occs) return false;
      for (var i = 0; i < occs.length; i++) {
        if (start < occs[i][1] && end > occs[i][0]) return true;
      }
      return false;
    }

    function addOccupancy(standId, start, end) {
      if (!occupied[standId]) occupied[standId] = [];
      occupied[standId].push([start, end]);
    }

    function sortKey(v) {
      if (v.standType === 'Unassigned') return 2;
      if (v.standType === 'Remote') return 1;
      return 0;
    }

    var assignments = [];
    var unassigned = [];

    sortedEventIds.forEach(function (eventId) {
      var ev = eventMap[eventId];
      if (!ev) return;

      var vars = varsByEvent[eventId];
      var active = vars.filter(function (v) { return state[v.index] === 1; });
      var fallback = vars.filter(function (v) { return state[v.index] !== 1; });

      active.sort(function (a, b) { return sortKey(a) - sortKey(b); });
      fallback.sort(function (a, b) { return sortKey(a) - sortKey(b); });
      var ordered = active.concat(fallback);

      var chosen = null;
      for (var i = 0; i < ordered.length; i++) {
        var v = ordered[i];
        if (v.standType === 'Unassigned') break;
        if (!isBlocked(v.standId, ev.start, ev.end)) {
          chosen = v;
          addOccupancy(v.standId, ev.start, ev.end);
          break;
        }
      }

      if (chosen) {
        assignments.push({
          eventId: ev.eventId,
          tail: ev.tail,
          standId: chosen.standId,
          standType: chosen.standType,
          start: ev.start,
          end: ev.end,
        });
      } else {
        unassigned.push(ev);
      }
    });

    var standOccMap = {};
    assignments.forEach(function (a) {
      if (!standOccMap[a.standId]) standOccMap[a.standId] = [];
      standOccMap[a.standId].push({ tail: a.tail, start: a.start, end: a.end });
    });

    var stands = menu.stands.map(function (sid) {
      var occs = standOccMap[sid] || [];
      occs.sort(function (a, b) { return a.start - b.start; });
      return { standId: sid, standType: menu.standTypes[sid], occupancies: occs };
    });

    return {
      terminal: menu.terminal,
      windowStart: menu.windowStart,
      windowEnd: menu.windowEnd,
      assignments: assignments,
      unassigned: unassigned,
      stands: stands,
    };
  }

  // ── DOM Renderer ─────────────────────────────────────────────────────────

  /**
   * Render a decoded window into a container element, matching the
   * presentation's TerminalGrid + StandAnimation style.
   *
   * @param {object}      decoded   - output of decodeState()
   * @param {HTMLElement}  container - target element (contents will be replaced)
   * @param {object}      [opts]    - { animate: true, windowMinutes: 240 }
   */
  function render(decoded, container, opts) {
    injectStyles();
    opts = opts || {};
    var animate = opts.animate !== false;
    var windowMinutes = opts.windowMinutes || 240;

    container.innerHTML = '';

    var contacts = decoded.stands.filter(function (s) { return s.standType === 'Contact'; });
    var remotes = decoded.stands.filter(function (s) { return s.standType === 'Remote'; });

    // State
    var currentMinute = 0;
    var playing = false;
    var speed = 1;
    var interval = null;

    // Build stand elements map for fast update
    var standElements = {};

    function getOccupantAtTime(stand, t) {
      for (var i = 0; i < stand.occupancies.length; i++) {
        var occ = stand.occupancies[i];
        if (t >= occ.start && t < occ.end) return occ;
      }
      return null;
    }

    function updateDisplay() {
      decoded.stands.forEach(function (stand) {
        var el = standElements[stand.standId];
        if (!el) return;
        var occ = getOccupantAtTime(stand, currentMinute);
        var isContact = stand.standType === 'Contact';

        // Reset classes
        el.box.className = 'qd-stand';
        if (occ) {
          el.box.className += isContact ? ' qd-stand-contact-occ' : ' qd-stand-remote-occ';
          el.tail.textContent = occ.tail;
          el.tail.className = 'qd-stand-tail';
        } else {
          el.tail.textContent = '\u00A0';
          el.tail.className = 'qd-stand-tail qd-stand-tail-empty';
        }
      });

      // Occupied count
      var occ = decoded.stands.filter(function (s) {
        return getOccupantAtTime(s, currentMinute) !== null;
      }).length;
      headerCount.textContent = occ + '/' + decoded.stands.length + ' occupied';

      // Time display
      var windowStartH = parseInt(decoded.windowStart.split(':')[0]) || 0;
      var windowStartM = parseInt(decoded.windowStart.split(':')[1]) || 0;
      var totalMin = windowStartH * 60 + windowStartM + currentMinute;
      var hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
      var mm = String(totalMin % 60).padStart(2, '0');
      if (timeDisplay) timeDisplay.textContent = hh + ':' + mm;
      if (slider) slider.value = currentMinute;
    }

    function buildStandBox(stand) {
      var box = document.createElement('div');
      box.className = 'qd-stand';

      var idEl = document.createElement('div');
      idEl.className = 'qd-stand-id';
      idEl.textContent = stand.standId;
      box.appendChild(idEl);

      var tailEl = document.createElement('div');
      tailEl.className = 'qd-stand-tail qd-stand-tail-empty';
      tailEl.textContent = '\u00A0';
      box.appendChild(tailEl);

      standElements[stand.standId] = { box: box, id: idEl, tail: tailEl };
      return box;
    }

    function buildSection(label, labelClass, standsList) {
      var section = document.createElement('div');
      section.className = 'qd-section';

      var lbl = document.createElement('div');
      lbl.className = 'qd-section-label ' + labelClass;
      lbl.textContent = label + ' (' + standsList.length + ')';
      section.appendChild(lbl);

      var wrap = document.createElement('div');
      wrap.className = 'qd-stands';
      standsList.forEach(function (s) {
        wrap.appendChild(buildStandBox(s));
      });
      section.appendChild(wrap);

      return section;
    }

    // ── Time controls ────────────────────────────────────────────────────
    var timeDisplay, slider;

    if (animate) {
      var timeBar = document.createElement('div');
      timeBar.className = 'qd-time-bar';

      var playBtn = document.createElement('button');
      playBtn.className = 'qd-btn';
      playBtn.textContent = 'Play';
      playBtn.onclick = function () {
        playing = !playing;
        playBtn.textContent = playing ? 'Pause' : 'Play';
        if (playing) {
          interval = setInterval(function () {
            currentMinute += 2 * speed;
            if (currentMinute >= windowMinutes) {
              currentMinute = windowMinutes - 1;
              playing = false;
              playBtn.textContent = 'Play';
              clearInterval(interval);
            }
            updateDisplay();
          }, 50);
        } else {
          clearInterval(interval);
        }
      };
      timeBar.appendChild(playBtn);

      var resetBtn = document.createElement('button');
      resetBtn.className = 'qd-btn';
      resetBtn.textContent = 'Reset';
      resetBtn.onclick = function () {
        currentMinute = 0;
        playing = false;
        playBtn.textContent = 'Play';
        clearInterval(interval);
        updateDisplay();
      };
      timeBar.appendChild(resetBtn);

      var speedBtn = document.createElement('button');
      speedBtn.className = 'qd-btn qd-btn-speed';
      speedBtn.textContent = '1x';
      speedBtn.onclick = function () {
        speed = speed >= 8 ? 1 : speed * 2;
        speedBtn.textContent = speed + 'x';
      };
      timeBar.appendChild(speedBtn);

      slider = document.createElement('input');
      slider.type = 'range';
      slider.min = 0;
      slider.max = windowMinutes - 1;
      slider.value = 0;
      slider.className = 'qd-slider';
      slider.oninput = function () {
        currentMinute = parseInt(slider.value);
        updateDisplay();
      };
      timeBar.appendChild(slider);

      timeDisplay = document.createElement('div');
      timeDisplay.className = 'qd-time-display';
      timeDisplay.textContent = decoded.windowStart;
      timeBar.appendChild(timeDisplay);

      container.appendChild(timeBar);
    }

    // ── Terminal grid ────────────────────────────────────────────────────
    var terminal = document.createElement('div');
    terminal.className = 'qd-terminal';

    var header = document.createElement('div');
    header.className = 'qd-header';

    var headerTitle = document.createElement('div');
    headerTitle.className = 'qd-header-title';
    headerTitle.textContent = 'Terminal ' + decoded.terminal;
    header.appendChild(headerTitle);

    var headerCount = document.createElement('div');
    headerCount.className = 'qd-header-count';
    headerCount.textContent = '0/' + decoded.stands.length + ' occupied';
    header.appendChild(headerCount);

    terminal.appendChild(header);

    if (contacts.length > 0) {
      terminal.appendChild(buildSection('Contact', 'qd-section-label-contact', contacts));
    }
    if (remotes.length > 0) {
      terminal.appendChild(buildSection('Remote', 'qd-section-label-remote', remotes));
    }

    if (decoded.unassigned.length > 0) {
      var unEl = document.createElement('div');
      unEl.className = 'qd-unassigned';
      unEl.textContent = 'Unassigned: ' + decoded.unassigned.map(function (e) { return e.tail; }).join(', ');
      terminal.appendChild(unEl);
    }

    container.appendChild(terminal);

    // Initial state: show time 0 occupancy
    updateDisplay();
  }

  // ── Text Gantt (debug) ───────────────────────────────────────────────────

  function renderTextGantt(decoded) {
    var cols = 16;
    var lines = [];
    lines.push('Terminal ' + decoded.terminal + '  ' + decoded.windowStart + ' - ' + decoded.windowEnd);
    lines.push(Array(61).join('-'));

    decoded.stands.forEach(function (stand) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push('·');
      stand.occupancies.forEach(function (occ) {
        var startCol = Math.floor(occ.start / 15);
        var endCol = Math.min(Math.ceil(occ.end / 15), cols);
        var label = occ.tail.slice(0, 3);
        for (var c = startCol; c < endCol; c++) {
          row[c] = c === startCol ? label : '#';
        }
      });
      var tag = stand.standType === 'Contact' ? 'C' : 'R';
      var sid = stand.standId;
      while (sid.length < 8) sid += ' ';
      lines.push(sid + ' [' + tag + '] ' + row.join(''));
    });

    if (decoded.unassigned.length > 0) {
      lines.push('');
      lines.push('Unassigned: ' + decoded.unassigned.map(function (e) { return e.tail; }).join(', '));
    }

    return lines.join('\n');
  }

  // ── Hardcoded W4 T2 Menu (08:00–12:00, 29 events, 1003 variables) ───────

  // Compatible stands per aircraft type in Terminal 2 (exact solver ordering)
  var COMPAT = {
    A320: { c: ['E3','E10','E20','F59','F40','F31','E22','E4','E5','F42','E7','E8','F60','E28','F58','E11','F41','E24','F50','F33','F34','F36','F54','E12','F52','E27','F37','F56','E6','E2','F35','F32','E26'], r: ['206','203','207','201','200','205','202','208'] },
    A321: { c: ['E3','E20','F59','F40','F31','E22','E5','F42','E7','E8','F60','E28','F58','E11','F41','E24','F50','F34','F36','F54','E12','F52','E27','F37','F56','E6','E2','F35','F32','E26'], r: ['206','203','207','201','200','205','202','208'] },
    B789: { c: ['E3','E20','F59','F40','F31','E22','E4','E5','F42','E8','F60','E28','F58','E11','F41','E24','F50','F33','F34','F54','E12','F52','E27','F56','E26'], r: ['206','203','207','201','200','205','202','208'] },
    A359: { c: ['E3','E20','F59','F40','F31','E22','E4','E5','F42','E8','F60','E28','F58','E11','F41','E24','F50','F54','E12','E27','F56','F35','E26'], r: ['206','203','207','201','200','205','202','208'] },
    B78X: { c: ['F59','F40','F31','E22','E4','E5','F42','E8','F60','E28','F58','E11','F41','F54','E12','E27','F56','E26'], r: ['206','203','207','201','200','205','202','208'] },
    B77W: { c: ['E11','F41','E24','F42','F54','E8','F60','E28','F59','E27','F56','E4','E26','F58','E5'], r: ['207','201','200','205','202','206','208','203'] },
    A388: { c: ['E11','F42','E8','F60','F31','E5'], r: [] },
    B738: { c: ['E3','E10','E20','F59','F40','F31','E22','E4','E5','F42','E7','E8','F60','E28','F58','E11','F41','E24','F50','F33','F34','F36','F54','E12','F52','E27','F37','F56','E6','E2','F35','F32','E26'], r: ['206','203','207','201','200','205','202','208'] },
    B38M: { c: ['E3','E10','E20','F59','F40','F31','E22','E4','E5','F42','E7','E8','F60','E28','F58','E11','F41','E24','F50','F33','F34','F36','F54','E12','F52','E27','F37','F56','E6','E2','F35','F32','E26'], r: ['206','203','207','201','200','205','202','208'] },
  };

  // All T2 stands (display order)
  var T2_STANDS = [
    'E2','E3','E4','E5','E6','E7','E8','E10','E11','E12',
    'E20','E22','E24','E26','E27','E28',
    'F31','F32','F33','F34','F35','F36','F37',
    'F40','F41','F42',
    'F50','F52','F54','F56','F58','F59','F60',
    '200','201','202','203','205','206','207','208',
  ];

  var T2_STAND_TYPES = {};
  T2_STANDS.forEach(function (s) {
    T2_STAND_TYPES[s] = s.charAt(0) >= '0' && s.charAt(0) <= '9' ? 'Remote' : 'Contact';
  });

  // 29 events: [eventId, tail, actype, startMin, endMin] (minutes from 08:00)
  var W4T2_EVENTS_RAW = [
    ['E0008','AB0007','A320',90,150],
    ['E0013','AC0001','A321',-15,45],
    ['E0014','AC0002','A321',75,150],
    ['E0016','AC0004','A321',160,235],
    ['E0018','AC0006','B789',-30,60],
    ['E0020','AC0008','A320',15,75],
    ['E0046','AH0001','A320',200,250],
    ['E0080','AR0001','A388',100,790],
    ['E0115','BC0004','B738',145,205],
    ['E0140','BM0004','B738',-470,115],
    ['E0141','BM0005','B738',135,185],
    ['E0145','BM0009','B738',205,255],
    ['E0160','BP0003','B789',-80,185],
    ['E0163','BS0001','A321',165,225],
    ['E0214','CH0011','A359',-445,40],
    ['E0215','CH0016','A359',220,355],
    ['E0234','CH0039','B78X',-120,10],
    ['E0236','CH0045','B78X',120,225],
    ['E0290','CH0117','B738',220,300],
    ['E0307','CH0134','B78X',-40,75],
    ['E0323','CH0152','B78X',200,290],
    ['E0325','CH0154','B38M',125,240],
    ['E0329','CH0159','B77W',170,275],
    ['E0332','CH0162','B38M',200,280],
    ['E0364','CH0200','A359',10,90],
    ['E0366','CH0202','A359',-50,140],
    ['E0368','CI0003','B77W',195,265],
    ['E0465','CM0001','B789',-105,45],
    ['E0486','CV0001','B789',-55,70],
  ];

  function getW4T2Menu() {
    var events = [];
    var variables = [];
    var idx = 0;

    // Sort events by start time (as the solver does)
    var sorted = W4T2_EVENTS_RAW.slice().sort(function (a, b) { return a[3] - b[3] || a[0].localeCompare(b[0]); });

    sorted.forEach(function (raw) {
      var eventId = raw[0], tail = raw[1], actype = raw[2], start = raw[3], end = raw[4];
      events.push({ eventId: eventId, tail: tail, start: start, end: end });

      var compat = COMPAT[actype];
      // Contacts
      compat.c.forEach(function (sid) {
        variables.push({ index: idx++, eventId: eventId, standId: sid, standType: 'Contact' });
      });
      // Remotes
      compat.r.forEach(function (sid) {
        variables.push({ index: idx++, eventId: eventId, standId: sid, standType: 'Remote' });
      });
      // Unassigned
      variables.push({ index: idx++, eventId: eventId, standId: '0', standType: 'Unassigned' });
    });

    return {
      variables: variables,
      events: events,
      stands: T2_STANDS,
      standTypes: T2_STAND_TYPES,
      windowStart: '08:00',
      windowEnd: '12:00',
      terminal: 2,
    };
  }

  /**
   * Convenience: decode a state vector using the hardcoded W4 T2 menu.
   * @param {number[]} state - 1003-element array of 0/1 values
   * @returns {object} decoded window ready for render()
   */
  function decode(state) {
    var menu = getW4T2Menu();
    if (state.length !== menu.variables.length) {
      console.warn('QuboDecoder.decode: expected ' + menu.variables.length + ' variables, got ' + state.length);
    }
    return decodeState(state, menu);
  }

  // ── Demo ─────────────────────────────────────────────────────────────────

  function createDemoMenu() {
    var menu = getW4T2Menu();
    // Build a plausible state: activate first compatible contact for each event
    var state = new Array(menu.variables.length).fill(0);
    var used = {};
    menu.events.forEach(function (ev) {
      var evVars = menu.variables.filter(function (v) { return v.eventId === ev.eventId && v.standType === 'Contact'; });
      for (var i = 0; i < evVars.length; i++) {
        var v = evVars[i];
        if (!used[v.standId]) {
          state[v.index] = 1;
          used[v.standId] = true;
          break;
        }
      }
    });
    return { menu: menu, state: state };
  }

  return {
    decodeState: decodeState,
    decode: decode,
    render: render,
    renderTextGantt: renderTextGantt,
    getW4T2Menu: getW4T2Menu,
    createDemoMenu: createDemoMenu,
  };
})();
