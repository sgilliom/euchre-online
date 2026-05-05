/* =================================================================
   PHD Inc. Actuator Simulator — Main JavaScript
================================================================= */
'use strict';

// ─── DATA ─────────────────────────────────────────────────────────

const GRIPPERS = [
  { id:'grr',  name:'Series GRR',  label:'High-Capacity Parallel Pneumatic', gripTime:0.15, force:'High — see datasheet', stroke:'5 sizes available', tags:['pneumatic','high capacity'], note:'High-capacity parallel pneumatic gripper. High grip force, five long jaw travels, and high jaw loads. Ideal for demanding industrial applications including automotive and foundry.' },
  { id:'grk',  name:'Series GRK',  label:'Heavy Duty Parallel Pneumatic',    gripTime:0.18, force:'383–10,431 N (w/ spring assist)', stroke:'8 sizes available', tags:['pneumatic','heavy'], note:'Precision heavy-duty parallel gripper. Long actuator life with spring-assist for higher grip force and part retention on loss of air pressure. 8 sizes.' },
  { id:'grb',  name:'Series GRB',  label:'Angular Pneumatic',                gripTime:0.20, force:'Varies by size', stroke:'Up to 180° jaw travel', tags:['pneumatic','angular'], note:'Angular pneumatic gripper with up to 180° jaw travel to clear the work area. Internal shock absorption. 6 sizes. Ideal for pick-and-place, assembly, or robot tooling.' },
  { id:'grt',  name:'Series GRT',  label:'3-Jaw Pneumatic',                  gripTime:0.15, force:'Varies by size', stroke:'3-jaw self-centering', tags:['pneumatic','round parts'], note:'3-jaw pneumatic gripper for cylindrical or round parts. Self-centering design ensures consistent positioning of shafts, tubes, and round stock.' },
  { id:'egrr', name:'Series EGRR', label:'Electric Parallel Jaw',            gripTime:0.35, force:'Programmable', stroke:'Programmable', tags:['electric','precise'], note:'Electric version built on the field-proven Series GRR chassis. Programmable grip force, position, and speed. Ideal for delicate parts and clean-room environments.' }
];

// baseVelocity = mm/s at rated pressure/speed with no load (estimates — pending PHD spec data)
// loadPenaltyPct = % speed reduction per kg of payload
const VERT_ACTUATORS = [
  { id:'vosp',   name:'Series OSP',     label:'Compact Thruster Slide — Pneumatic',      baseVelocity:400, maxStroke:300, type:'pneumatic', loadPenaltyPct:0.8, note:'Compact pneumatic thruster slide (Optimax). 8 bore sizes (12–63 mm), multiple travel lengths. Bronze alloy or PTFE/bronze bearings. Stainless or chrome-plated rod. Good all-around vertical axis choice.' },
  { id:'vcv',    name:'Series CV',      label:'ISO/VDMA Pneumatic Cylinder',              baseVelocity:400, maxStroke:500, type:'pneumatic', loadPenaltyPct:0.8, note:'ISO 15552 / VDMA 24562 compliant pneumatic cylinder. Bore sizes 20–100 mm, long-travel capable. Port Controls option for speed adjustment throughout stroke. Rodlok option holds mid-stroke position. 0.5–10 bar.' },
  { id:'vosw',   name:'Series OSW',     label:'Dual-Bore Slide Table — Pneumatic',        baseVelocity:380, maxStroke:400, type:'pneumatic', loadPenaltyPct:0.6, note:'Dual-bore pneumatic slide table for high power in compact spaces. 6 bore sizes with incremental travel lengths. Dual bores provide high force and excellent moment resistance for vertical loading.' },
  { id:'vesksl', name:'Series ESK/ESL', label:'Electric Thruster Slide',                  baseVelocity:200, maxStroke:300, type:'electric',  loadPenaltyPct:3.5, note:'Electric thruster slide in short (ESK) or long (ESL) body. Powered by PHD ECVA electric cylinder — ball screw or lead screw options. Programmable position, speed, and force.' },
  { id:'vescv',  name:'Series ESCV',    label:'Electric Vertical Thruster Slide',          baseVelocity:180, maxStroke:400, type:'electric',  loadPenaltyPct:3.5, note:'Electric vertical thruster slide powered by PHD Series ECV electric cylinder (ball screw or lead screw). Designed for high-repeatability vertical applications. Programmable multi-position control. Clean, quiet operation.' }
];

const HORIZ_ACTUATORS = [
  { id:'hav',   name:'Series AV/AVS', label:'NFPA Tie-Rod Pneumatic Cylinder',            baseVelocity:400, maxStroke:600,  type:'pneumatic', loadPenaltyPct:0.8, note:'NFPA-standard tie-rod pneumatic cylinder (Series AV) with heavy-duty AVS variant. Bore sizes 3/4"–4", strokes to 24"+. Cartridge-type bushings (AVS) for high cycle and side-load applications. 20–150 psi. Field repairable.' },
  { id:'hsfm',  name:'Series SFM',   label:'Multi-Position Rodless Gantry — Pneumatic',   baseVelocity:300, maxStroke:1500, type:'pneumatic', loadPenaltyPct:0.6, note:'Multi-position rodless gantry rail slide. Stainless steel band/saddle seal and rail bearings. Adjustable intermediate stops for multi-station transfers. Lowest deflection and highest moment capacity in class. Internal shock pads.' },
  { id:'hosw',  name:'Series OSW',   label:'Dual-Bore Slide Table — Pneumatic',            baseVelocity:380, maxStroke:600,  type:'pneumatic', loadPenaltyPct:0.6, note:'Dual-bore pneumatic slide table for high power in compact spaces. 6 bore sizes with incremental travel lengths. Excellent lateral load capacity for horizontal transfer of heavier parts.' },
  { id:'hesz',  name:'Series ESZ',   label:'Belt-Drive Linear Actuator — Electric',         baseVelocity:500, maxStroke:5500, type:'electric',  loadPenaltyPct:2.0, note:'Electric belt-driven linear cantilever actuator. HTD8 steel-reinforced polyurethane belt, zero-backlash coupling. 2 profile sizes, travel to 5,500 mm, up to 5,000 mm/s. Motor stays stationary for reduced moving mass. "Your Motor, Your Way" interface.' },
  { id:'hesurb', name:'Series ESU-RB', label:'Ball Screw Linear Actuator — Electric',      baseVelocity:350, maxStroke:1000, type:'electric',  loadPenaltyPct:3.0, note:'Enclosed electric ball screw linear actuator. 3 sizes, strokes to 1,000 mm, up to 3,200 mm/s. IP54 magnetic band seal. High-capacity rail bearing system, exceptional moment load capability. Dual saddle option. "Your Motor, Your Way" interface.' }
];

// vertVelocity / horizVelocity = mm/s per axis (estimates)
const COMBO_UNITS = [
  { id:'csfm',   name:'Series SFM + OSP',    label:'Modular Pneumatic X+Z Assembly',     axes:'X + Z', vertVelocity:400, horizVelocity:300, type:'pneumatic', loadPenaltyPct:0.7, note:'PHD modular mounting hardware combines Series SFM rodless gantry (horizontal) and Series OSP thruster slide (vertical) into a complete pick & place unit. Standard hardware allows fast assembly and reconfiguration.' },
  { id:'cesurt', name:'Series ESU-RT + ESCV', label:'All-Electric Belt-Drive X+Z Gantry', axes:'X + Z', vertVelocity:180, horizVelocity:600, type:'electric',  loadPenaltyPct:3.0, note:'All-electric gantry pairing Series ESU-RT belt-driven horizontal slide (to 5,500 mm, 5,000 mm/s) with Series ESCV electric vertical thruster slide (ECV-powered). 3 horizontal sizes, IP54 sealed, dual saddle option. Fully programmable multi-position control.' },
  { id:'cesz',   name:'Series ESZ + ESFA',   label:'High-Speed Electric Gantry',          axes:'X+Z',   vertVelocity:160, horizVelocity:500, type:'electric',  loadPenaltyPct:3.0, note:'High-speed electric gantry using Series ESZ belt-drive (up to 5,500 mm / 5,000 mm/s horizontal) combined with Series ESFA integrated-servo ball screw (vertical). Fully programmable multi-axis positioning. 24–75 VDC servo.' }
];

const SCENARIO_OBJECTS = {
  electronics: [
    { id:'pcb',       label:'PCB Board',      icon:'🟢', color:'#2E7D32', weightDefault:0.05 },
    { id:'ic',        label:'IC Chip',         icon:'🔵', color:'#1565C0', weightDefault:0.01 },
    { id:'connector', label:'Connector',       icon:'🟡', color:'#F9A825', weightDefault:0.02 },
    { id:'motor',     label:'Small Motor',     icon:'🟠', color:'#E65100', weightDefault:0.08 },
    { id:'sensor',    label:'Sensor Module',   icon:'⚪', color:'#78909C', weightDefault:0.03 }
  ],
  packaging: [
    { id:'box',    label:'Cardboard Box', icon:'📦', color:'#795548', weightDefault:0.8 },
    { id:'bottle', label:'Bottle',        icon:'🔵', color:'#1E88E5', weightDefault:0.5 },
    { id:'pouch',  label:'Pouch',         icon:'🟡', color:'#FDD835', weightDefault:0.3 },
    { id:'tray',   label:'Tray',          icon:'🟢', color:'#43A047', weightDefault:0.4 },
    { id:'blister',label:'Blister Pack',  icon:'⚪', color:'#90A4AE', weightDefault:0.15 }
  ],
  automotive: [
    { id:'bracket', label:'Bracket',       icon:'🔴', color:'#C62828', weightDefault:1.2 },
    { id:'casting', label:'Casting',       icon:'🟤', color:'#6D4C41', weightDefault:4.5 },
    { id:'shaft',   label:'Shaft',         icon:'🔵', color:'#1565C0', weightDefault:2.0 },
    { id:'gear',    label:'Gear',          icon:'🟠', color:'#EF6C00', weightDefault:1.8 },
    { id:'panel',   label:'Stamped Panel', icon:'🔵', color:'#37474F', weightDefault:3.2 }
  ],
  medical: [
    { id:'syringe',  label:'Syringe',    icon:'🔵', color:'#0288D1', weightDefault:0.05 },
    { id:'vial',     label:'Vial',       icon:'🟡', color:'#F9A825', weightDefault:0.08 },
    { id:'implant',  label:'Implant',    icon:'⚪', color:'#B0BEC5', weightDefault:0.03 },
    { id:'cartridge',label:'Cartridge',  icon:'🟢', color:'#2E7D32', weightDefault:0.06 },
    { id:'petri',    label:'Petri Dish', icon:'🔴', color:'#E53935', weightDefault:0.07 }
  ],
  food: [
    { id:'fbottle',   label:'Bottle',    icon:'🔵', color:'#1E88E5', weightDefault:0.6 },
    { id:'container', label:'Container', icon:'🟢', color:'#43A047', weightDefault:0.4 },
    { id:'fpouch',    label:'Pouch',     icon:'🟡', color:'#FDD835', weightDefault:0.3 },
    { id:'can',       label:'Can',       icon:'🔴', color:'#E53935', weightDefault:0.5 },
    { id:'ftray',     label:'Tray',      icon:'🟫', color:'#8D6E63', weightDefault:0.35 }
  ],
  general: [
    { id:'small',  label:'Small Part',  icon:'⚪', color:'#90A4AE', weightDefault:0.1 },
    { id:'medium', label:'Medium Part', icon:'🟡', color:'#FDD835', weightDefault:1.0 },
    { id:'large',  label:'Large Part',  icon:'🟠', color:'#EF6C00', weightDefault:3.0 },
    { id:'heavy',  label:'Heavy Block', icon:'🔴', color:'#C62828', weightDefault:8.0 },
    { id:'custom', label:'Custom Item', icon:'🟢', color:'#43A047', weightDefault:2.0 }
  ]
};

const SCENARIO_LABELS = {
  electronics: 'PCB & Electronics Assembly',
  packaging:   'Packaging & Palletizing',
  automotive:  'Automotive Parts Handling',
  medical:     'Medical Device Assembly',
  food:        'Food & Beverage Handling',
  general:     'General Industrial Transfer'
};

// Recommended component IDs per scenario
const RECOMMENDATIONS = {
  electronics: { gripper:'grr',  vert:'vcv',    horiz:'hav',    combo:'csfm'  },
  packaging:   { gripper:'grr',  vert:'vosp',   horiz:'hsfm',   combo:'csfm'  },
  automotive:  { gripper:'grk',  vert:'vosw',   horiz:'hav',    combo:'cesurt'},
  medical:     { gripper:'egrr', vert:'vesksl', horiz:'hesurb', combo:'cesz'  },
  food:        { gripper:'grr',  vert:'vosp',   horiz:'hsfm',   combo:'csfm'  },
  general:     { gripper:'grr',  vert:'vosp',   horiz:'hav',    combo:'csfm'  }
};

// ─── APP STATE ────────────────────────────────────────────────────
const state = {
  scenario:     null,
  object:       null,
  weightKg:     0.5,
  axisMode:     'separate',
  gripper:      null,
  vertActuator: null,
  horizActuator:null,
  comboUnit:    null,
  vertStroke:   100,   // mm
  horizStroke:  300,   // mm
  currentScreen: 'scenario'
};

const VERT_STROKE_OPTIONS  = [50, 75, 100, 150, 200, 300];
const HORIZ_STROKE_OPTIONS = [100, 200, 300, 500, 750, 1000];

// ─── SCREEN NAVIGATION ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  state.currentScreen = id;
  updateStepIndicators();
  const backBtn = document.getElementById('btn-back');
  backBtn.classList.toggle('visible', id !== 'scenario');
}

function updateStepIndicators() {
  const map = { scenario: 1, configure: 2, simulate: 3 };
  const current = map[state.currentScreen] || 1;
  [1, 2, 3].forEach(n => {
    const el = document.getElementById('step-ind-' + n);
    el.classList.remove('active', 'done');
    if (n === current) el.classList.add('active');
    else if (n < current) el.classList.add('done');
  });
}

function selectScenario(el) {
  document.querySelectorAll('#scenario-grid .sel-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.scenario = el.dataset.id;
  document.getElementById('btn-scenario-next').disabled = false;
}

function goToConfigure() {
  if (!state.scenario) return;
  document.getElementById('sum-scenario').textContent = SCENARIO_LABELS[state.scenario];
  document.getElementById('config-subtitle').textContent =
    'Configuring for: ' + SCENARIO_LABELS[state.scenario];
  populateObjectGrid();
  populateGripperGrid();
  populateVertGrid();
  populateHorizGrid();
  populateComboGrid();
  renderStrokeButtons('vert-stroke-btns',  VERT_STROKE_OPTIONS,  state.vertStroke,  'selectVertStroke');
  renderStrokeButtons('horiz-stroke-btns', HORIZ_STROKE_OPTIONS, state.horizStroke, 'selectHorizStroke');
  document.getElementById('sum-vert-stroke').textContent  = state.vertStroke  + ' mm';
  document.getElementById('sum-horiz-stroke').textContent = state.horizStroke + ' mm';
  showScreen('configure');
}

function goToSimulate() {
  showScreen('simulate');
  populateStats();
  buildPhaseBar();
  initCanvas();
}

function goBack() {
  if (state.currentScreen === 'configure') showScreen('scenario');
  else if (state.currentScreen === 'simulate') showScreen('configure');
}

document.getElementById('btn-back').addEventListener('click', goBack);

// ─── WEIGHT SLIDER ────────────────────────────────────────────────
function updateWeight(val) {
  // Map 0-100 to 0.05-20 kg (roughly logarithmic feel)
  const kg = val < 2 ? 0.05 : Math.round((Math.pow(val / 100, 2.2) * 20) * 100) / 100;
  state.weightKg = kg;
  const disp = kg < 1 ? (kg * 1000).toFixed(0) + ' g' : kg.toFixed(2) + ' kg';
  document.getElementById('weight-display').textContent = disp;
  document.getElementById('sum-weight').textContent = disp;
  updateSummary();
}

// ─── AXIS MODE ────────────────────────────────────────────────────
function selectAxisMode(btn) {
  document.querySelectorAll('.axis-mode-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.axisMode = btn.dataset.mode;

  const isSeparate = state.axisMode === 'separate';
  document.getElementById('vert-section').style.display   = isSeparate ? '' : 'none';
  document.getElementById('horiz-section').style.display  = isSeparate ? '' : 'none';
  document.getElementById('combo-section').style.display  = isSeparate ? 'none' : '';

  const archLabels = { separate: 'Separate Axes', dual: 'Dual-Axis Unit', multi: 'Multi-Axis Gantry' };
  document.getElementById('sum-arch').textContent = archLabels[state.axisMode];
  document.getElementById('sum-vert-row').style.display  = isSeparate ? '' : 'none';
  document.getElementById('sum-horiz-row').style.display = isSeparate ? '' : 'none';
  document.getElementById('sum-combo-row').style.display = isSeparate ? 'none' : '';

  // Clear incompatible selections
  if (!isSeparate) { state.vertActuator = null; state.horizActuator = null; }
  else { state.comboUnit = null; }
  updateSummary();
}

// ─── GRID POPULATION ─────────────────────────────────────────────
function makeTagHTML(tags) {
  return tags.map(t => {
    const cls = ['electric','pneumatic','fast','precise','heavy','compact','round parts','hygiene'].includes(t) ? t.replace(' ','-') : '';
    return `<span class="tag ${cls}">${t}</span>`;
  }).join('');
}

function populateObjectGrid() {
  const objects = SCENARIO_OBJECTS[state.scenario] || [];
  const grid = document.getElementById('object-grid');
  grid.innerHTML = objects.map(obj => `
    <div class="sel-card" data-id="${obj.id}" onclick="selectObject(this,'${obj.id}')">
      <div class="card-icon">${obj.icon}</div>
      <div class="card-title">${obj.label}</div>
      <div class="card-desc">Typical weight: ~${obj.weightDefault < 1 ? (obj.weightDefault*1000).toFixed(0)+' g' : obj.weightDefault+' kg'}</div>
    </div>
  `).join('');
  // Set slider default for this scenario's first object if nothing selected
  if (!state.object && objects.length) {
    const def = objects[0].weightDefault;
    state.weightKg = def;
    const sliderVal = Math.round(Math.pow(def / 20, 1/2.2) * 100);
    const slider = document.getElementById('weight-slider');
    if (slider) slider.value = Math.max(2, sliderVal);
    updateWeight(slider ? slider.value : 50);
  }
}

function populateGripperGrid() {
  const rec = RECOMMENDATIONS[state.scenario] || {};
  document.getElementById('gripper-grid').innerHTML = GRIPPERS.map(g => `
    <div class="sel-card" data-id="${g.id}" onclick="selectGripper(this,'${g.id}')" style="position:relative">
      ${g.id === rec.gripper ? '<div class="rec-badge">Recommended</div>' : ''}
      <div class="card-title">${g.name}</div>
      <div class="card-desc">${g.label}</div>
      <div class="card-tags">${makeTagHTML(g.tags)}</div>
      <div class="card-spec">
        <div class="spec-item"><span class="spec-label">Grip time</span><br><span class="spec-val">${(g.gripTime*1000).toFixed(0)} ms</span></div>
        <div class="spec-item"><span class="spec-label">Force</span><br><span class="spec-val">${g.force}</span></div>
        <div class="spec-item"><span class="spec-label">Stroke</span><br><span class="spec-val">${g.stroke}</span></div>
      </div>
    </div>
  `).join('');
}

function populateVertGrid() {
  const rec = RECOMMENDATIONS[state.scenario] || {};
  document.getElementById('vert-grid').innerHTML = VERT_ACTUATORS.map(a => `
    <div class="sel-card" data-id="${a.id}" onclick="selectVert(this,'${a.id}')" style="position:relative">
      ${a.id === rec.vert ? '<div class="rec-badge">Recommended</div>' : ''}
      <div class="card-title">${a.name}</div>
      <div class="card-desc">${a.label}</div>
      <div class="card-tags"><span class="tag ${a.type}">${a.type}</span></div>
      <div class="card-spec">
        <div class="spec-item"><span class="spec-label">Stroke time</span><br><span class="spec-val">${(a.strokeTime*1000).toFixed(0)} ms</span></div>
        <div class="spec-item"><span class="spec-label">Max stroke</span><br><span class="spec-val">${a.maxStroke}</span></div>
      </div>
    </div>
  `).join('');
}

function populateHorizGrid() {
  const rec = RECOMMENDATIONS[state.scenario] || {};
  document.getElementById('horiz-grid').innerHTML = HORIZ_ACTUATORS.map(a => `
    <div class="sel-card" data-id="${a.id}" onclick="selectHoriz(this,'${a.id}')" style="position:relative">
      ${a.id === rec.horiz ? '<div class="rec-badge">Recommended</div>' : ''}
      <div class="card-title">${a.name}</div>
      <div class="card-desc">${a.label}</div>
      <div class="card-tags"><span class="tag ${a.type}">${a.type}</span></div>
      <div class="card-spec">
        <div class="spec-item"><span class="spec-label">Stroke time</span><br><span class="spec-val">${(a.strokeTime*1000).toFixed(0)} ms</span></div>
        <div class="spec-item"><span class="spec-label">Max stroke</span><br><span class="spec-val">${a.maxStroke}</span></div>
      </div>
    </div>
  `).join('');
}

function populateComboGrid() {
  const rec = RECOMMENDATIONS[state.scenario] || {};
  document.getElementById('combo-grid').innerHTML = COMBO_UNITS.map(c => `
    <div class="sel-card" data-id="${c.id}" onclick="selectCombo(this,'${c.id}')" style="position:relative">
      ${c.id === rec.combo ? '<div class="rec-badge">Recommended</div>' : ''}
      <div class="card-title">${c.name}</div>
      <div class="card-desc">${c.label}</div>
      <div class="card-tags"><span class="tag ${c.type}">${c.type}</span><span class="tag">${c.axes}</span></div>
      <div class="card-spec">
        <div class="spec-item"><span class="spec-label">Cycle time</span><br><span class="spec-val">${(c.comboTime*1000).toFixed(0)} ms</span></div>
        <div class="spec-item"><span class="spec-label">Axes</span><br><span class="spec-val">${c.axes}</span></div>
      </div>
    </div>
  `).join('');
}

// ─── SELECTION HANDLERS ───────────────────────────────────────────
function selectInGrid(gridId, el) {
  document.querySelectorAll('#' + gridId + ' .sel-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function selectObject(el, id) {
  selectInGrid('object-grid', el);
  state.object = id;
  const obj = (SCENARIO_OBJECTS[state.scenario] || []).find(o => o.id === id);
  document.getElementById('sum-object').textContent = obj ? obj.label : id;
  document.getElementById('sum-object').classList.remove('empty');
  if (obj) {
    state.weightKg = obj.weightDefault;
    const sliderVal = Math.max(2, Math.round(Math.pow(obj.weightDefault / 20, 1/2.2) * 100));
    document.getElementById('weight-slider').value = sliderVal;
    updateWeight(sliderVal);
  }
  updateSummary();
}

function selectGripper(el, id) {
  selectInGrid('gripper-grid', el);
  state.gripper = id;
  const g = GRIPPERS.find(x => x.id === id);
  const sumEl = document.getElementById('sum-gripper');
  sumEl.textContent = g ? g.name + ' — ' + g.label : id;
  sumEl.classList.remove('empty');
  updateSummary();
}

function selectVert(el, id) {
  selectInGrid('vert-grid', el);
  state.vertActuator = id;
  const a = VERT_ACTUATORS.find(x => x.id === id);
  const sumEl = document.getElementById('sum-vert');
  sumEl.textContent = a ? a.name + ' (' + a.type + ')' : id;
  sumEl.classList.remove('empty');
  updateSummary();
}

function selectHoriz(el, id) {
  selectInGrid('horiz-grid', el);
  state.horizActuator = id;
  const a = HORIZ_ACTUATORS.find(x => x.id === id);
  const sumEl = document.getElementById('sum-horiz');
  sumEl.textContent = a ? a.name + ' (' + a.type + ')' : id;
  sumEl.classList.remove('empty');
  updateSummary();
}

function selectCombo(el, id) {
  selectInGrid('combo-grid', el);
  state.comboUnit = id;
  const c = COMBO_UNITS.find(x => x.id === id);
  const sumEl = document.getElementById('sum-combo');
  sumEl.textContent = c ? c.name + ' — ' + c.label : id;
  sumEl.classList.remove('empty');
  updateSummary();
}

function resetConfig() {
  state.object = null; state.gripper = null;
  state.vertActuator = null; state.horizActuator = null; state.comboUnit = null;
  state.vertStroke = 100; state.horizStroke = 300;
  populateObjectGrid(); populateGripperGrid(); populateVertGrid();
  populateHorizGrid(); populateComboGrid();
  renderStrokeButtons('vert-stroke-btns',  VERT_STROKE_OPTIONS,  state.vertStroke,  'selectVertStroke');
  renderStrokeButtons('horiz-stroke-btns', HORIZ_STROKE_OPTIONS, state.horizStroke, 'selectHorizStroke');
  ['sum-object','sum-gripper','sum-vert','sum-horiz','sum-combo'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = 'not selected'; el.classList.add('empty');
  });
  document.getElementById('sum-cycle').innerHTML = '—<span> s</span>';
  document.getElementById('sum-pph').textContent = '';
  document.getElementById('btn-run-sim').disabled = true;
}

// ─── STROKE SELECTORS ─────────────────────────────────────────────
function renderStrokeButtons(containerId, options, selected, fnName) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = options.map(mm =>
    `<button class="stroke-btn${mm === selected ? ' selected' : ''}" data-mm="${mm}" onclick="${fnName}(this)">${mm} mm</button>`
  ).join('');
}

function selectVertStroke(btn) {
  state.vertStroke = parseInt(btn.dataset.mm);
  document.querySelectorAll('#vert-stroke-btns .stroke-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('sum-vert-stroke').textContent = state.vertStroke + ' mm';
  updateSummary();
}

function selectHorizStroke(btn) {
  state.horizStroke = parseInt(btn.dataset.mm);
  document.querySelectorAll('#horiz-stroke-btns .stroke-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('sum-horiz-stroke').textContent = state.horizStroke + ' mm';
  updateSummary();
}

// ─── CYCLE TIME CALCULATION ───────────────────────────────────────
const PHASE_DEFS = [
  { id:'move_down',   label:'Descend to Pickup',  cssClass:'ph-down',    color:'#0072CE' },
  { id:'grip',        label:'Grip Object',         cssClass:'ph-grip',    color:'#28A745' },
  { id:'move_up',     label:'Lift Object',         cssClass:'ph-up',      color:'#7B1FA2' },
  { id:'move_horiz',  label:'Transfer Horizontal', cssClass:'ph-horiz',   color:'#F7941D' },
  { id:'move_down2',  label:'Descend to Drop',     cssClass:'ph-down2',   color:'#0056A8' },
  { id:'release',     label:'Release Object',      cssClass:'ph-release', color:'#DC3545' },
  { id:'move_up2',    label:'Return Lift',         cssClass:'ph-up2',     color:'#455A64' },
  { id:'move_return', label:'Return Home',         cssClass:'ph-return',  color:'#37474F' }
];

// Load factor: speed slows with heavier payloads.
// Pneumatic: minimal effect (~0.8% per kg). Electric: significant (~3-4% per kg).
function loadFactor(actuator, kg) {
  const penalty = (actuator.loadPenaltyPct || 1) * kg / 100;
  return Math.min(1 + penalty, 3.0); // cap at 3× slowdown
}

// gripTime can increase slightly with load for electric grippers
function gripTime(g, kg) {
  const base = g.gripTime;
  if (g.tags && g.tags.includes('electric')) return base * (1 + kg * 0.02);
  return base;
}

function calcCycleTime() {
  const g = GRIPPERS.find(x => x.id === state.gripper);
  if (!g) return null;

  const gt = gripTime(g, state.weightKg);
  let phases;

  if (state.axisMode === 'separate') {
    const v = VERT_ACTUATORS.find(x => x.id === state.vertActuator);
    const h = HORIZ_ACTUATORS.find(x => x.id === state.horizActuator);
    if (!v || !h) return null;

    const vt = (state.vertStroke  / v.baseVelocity) * loadFactor(v, state.weightKg);
    const ht = (state.horizStroke / h.baseVelocity) * loadFactor(h, state.weightKg);

    const times = {
      move_down: vt,  grip: gt,
      move_up: vt,    move_horiz: ht,
      move_down2: vt, release: gt,
      move_up2: vt,   move_return: ht
    };
    phases = PHASE_DEFS.map(p => ({ ...p, time: times[p.id] }));

  } else {
    const c = COMBO_UNITS.find(x => x.id === state.comboUnit);
    if (!c) return null;

    const vt = (state.vertStroke  / c.vertVelocity)  * loadFactor(c, state.weightKg);
    const ht = (state.horizStroke / c.horizVelocity) * loadFactor(c, state.weightKg);

    const times = {
      move_down: vt,  grip: gt,
      move_up: vt,    move_horiz: ht,
      move_down2: vt, release: gt,
      move_up2: vt,   move_return: ht
    };
    phases = PHASE_DEFS.map(p => ({ ...p, time: times[p.id] }));
  }

  const total = phases.reduce((s, p) => s + p.time, 0);
  return { total: Math.round(total * 100) / 100, phases };
}

function updateSummary() {
  const result = calcCycleTime();
  const cycleEl = document.getElementById('sum-cycle');
  const pphEl   = document.getElementById('sum-pph');
  const noteEl  = document.getElementById('sum-note');
  const runBtn  = document.getElementById('btn-run-sim');

  if (result) {
    cycleEl.innerHTML = result.total.toFixed(2) + '<span> s</span>';
    const pph = Math.floor(3600 / result.total);
    pphEl.textContent = pph.toLocaleString() + ' parts / hour';
    runBtn.disabled = false;

    // Show load impact note
    const v = VERT_ACTUATORS.find(x => x.id === state.vertActuator);
    const h = HORIZ_ACTUATORS.find(x => x.id === state.horizActuator);
    const g2 = GRIPPERS.find(x => x.id === state.gripper);
    const hasElectric = (v && v.type==='electric') || (h && h.type==='electric') || (g2 && g2.tags.includes('electric'));
    if (state.weightKg > 1 || hasElectric) {
      const lf = v ? loadFactor(v, state.weightKg) : 1;
      const slowPct = Math.round((lf - 1) * 100);
      noteEl.style.display = '';
      noteEl.textContent = hasElectric
        ? `Electric actuators slow ~${slowPct}% at ${state.weightKg < 1 ? (state.weightKg*1000).toFixed(0)+' g' : state.weightKg.toFixed(1)+' kg'} payload. Stroke: ↕ ${state.vertStroke} mm / ↔ ${state.horizStroke} mm.`
        : `Pneumatic actuators have minimal speed change with load (~${slowPct}% at this payload). Stroke: ↕ ${state.vertStroke} mm / ↔ ${state.horizStroke} mm.`;
    } else {
      noteEl.style.display = 'none';
    }
  } else {
    cycleEl.innerHTML = '—<span> s</span>';
    pphEl.textContent = '';
    runBtn.disabled = true;
    noteEl.style.display = 'none';
  }
}

// ─── STATS PANEL ──────────────────────────────────────────────────
function populateStats() {
  const result = calcCycleTime();
  if (!result) return;

  document.getElementById('stat-cycle').textContent = result.total.toFixed(2);
  const pph = Math.floor(3600 / result.total);
  document.getElementById('stat-pph').textContent = pph.toLocaleString() + ' parts / hour';

  // Phase breakdown
  const bd = document.getElementById('phase-breakdown');
  bd.innerHTML = result.phases.map(p => `
    <div class="phase-row">
      <div class="phase-dot" style="background:${p.color}"></div>
      <div class="phase-name">${p.label}</div>
      <div class="phase-time">${(p.time * 1000).toFixed(0)} ms</div>
    </div>
    <div class="phase-bar-mini" style="background:${p.color};width:${Math.round(p.time/result.total*100)}%"></div>
  `).join('');

  // Selected summary
  const g = GRIPPERS.find(x => x.id === state.gripper);
  const v = VERT_ACTUATORS.find(x => x.id === state.vertActuator);
  const h = HORIZ_ACTUATORS.find(x => x.id === state.horizActuator);
  const c = COMBO_UNITS.find(x => x.id === state.comboUnit);
  const obj = (SCENARIO_OBJECTS[state.scenario] || []).find(o => o.id === state.object);
  const archLabels = { separate: 'Separate Axes', dual: 'Dual-Axis Unit', multi: 'Multi-Axis Gantry' };

  document.getElementById('selected-summary').innerHTML = `
    <div class="sel-sum-row"><div class="sel-sum-icon">🏭</div><div class="sel-sum-info">
      <div class="sel-sum-label">Scenario</div>
      <div class="sel-sum-name">${SCENARIO_LABELS[state.scenario]}</div>
    </div></div>
    <div class="sel-sum-row"><div class="sel-sum-icon">${obj ? obj.icon : '📦'}</div><div class="sel-sum-info">
      <div class="sel-sum-label">Object / Payload</div>
      <div class="sel-sum-name">${obj ? obj.label : 'Custom'} — ${state.weightKg < 1 ? (state.weightKg*1000).toFixed(0)+' g' : state.weightKg.toFixed(2)+' kg'}</div>
    </div></div>
    <div class="sel-sum-row"><div class="sel-sum-icon">✊</div><div class="sel-sum-info">
      <div class="sel-sum-label">Gripper</div>
      <div class="sel-sum-name">${g ? g.name + ' — ' + g.label : '—'}</div>
    </div></div>
    ${state.axisMode === 'separate' ? `
    <div class="sel-sum-row"><div class="sel-sum-icon">↕️</div><div class="sel-sum-info">
      <div class="sel-sum-label">Vertical Actuator</div>
      <div class="sel-sum-name">${v ? v.name + ' — ' + v.label : '—'}</div>
    </div></div>
    <div class="sel-sum-row"><div class="sel-sum-icon">↔️</div><div class="sel-sum-info">
      <div class="sel-sum-label">Horizontal Actuator</div>
      <div class="sel-sum-name">${h ? h.name + ' — ' + h.label : '—'}</div>
    </div></div>` : `
    <div class="sel-sum-row"><div class="sel-sum-icon">🔀</div><div class="sel-sum-info">
      <div class="sel-sum-label">Axis Unit</div>
      <div class="sel-sum-name">${c ? c.name + ' — ' + c.label : '—'}</div>
    </div></div>`}
    <div class="sel-sum-row"><div class="sel-sum-icon">🔩</div><div class="sel-sum-info">
      <div class="sel-sum-label">Architecture</div>
      <div class="sel-sum-name">${archLabels[state.axisMode]}</div>
    </div></div>
  `;

  // Sizing note
  const noteCard = document.getElementById('sim-note-card');
  const noteText = document.getElementById('sim-note-text');
  const notes = [];
  if (g) notes.push(g.note);
  if (v) notes.push(v.note);
  if (h) notes.push(h.note);
  if (c) notes.push(c.note);
  if (notes.length) {
    noteCard.style.display = '';
    noteText.innerHTML = notes.map(n => `<p style="margin-bottom:.4rem">• ${n}</p>`).join('');
  } else {
    noteCard.style.display = 'none';
  }
}

// ─── PHASE BAR ────────────────────────────────────────────────────
function buildPhaseBar() {
  const result = calcCycleTime();
  if (!result) return;
  const bar = document.getElementById('phase-bar');
  bar.innerHTML = result.phases.map((p, i) => {
    const pct = (p.time / result.total * 100).toFixed(1);
    return `<div class="phase-seg ${p.cssClass}" style="width:${pct}%;min-width:4px" data-phase="${i}" title="${p.label}: ${(p.time*1000).toFixed(0)}ms">
      ${pct > 8 ? p.label.split(' ')[0] : ''}
    </div>`;
  }).join('');
}

function updatePhaseBar(phaseIdx) {
  document.querySelectorAll('.phase-seg').forEach((el, i) => {
    el.classList.toggle('active', i === phaseIdx);
  });
  const result = calcCycleTime();
  if (result && result.phases[phaseIdx]) {
    document.getElementById('phase-label-text').textContent =
      'Phase: ' + result.phases[phaseIdx].label +
      ' (' + (result.phases[phaseIdx].time * 1000).toFixed(0) + ' ms)';
  }
}

// ─── CANVAS SIMULATION ────────────────────────────────────────────
let animId = null;
let simPaused = false;
let speedMult = 1;
let cycleCount = 0;
let simPhaseIdx = 0;
let phaseProgress = 0; // 0..1
let lastTimestamp = null;
let holding = false;
let jawGap = 18;
let dropObjects = [];

// Canvas layout constants
const CW = 640, CH = 340;
const RAIL_H = 14;
const PLATFORM_Y = 295, PLATFORM_W = 80, PLATFORM_H = 10;
const OBJ_W = 44, OBJ_H = 26;
const JAW_OPEN = 18, JAW_CLOSED = 4;
// Gripper always descends to just above the object — this never changes
const GRIPPER_DOWN_Y = PLATFORM_Y - OBJ_H - 20; // 249

// Dynamic layout — positions scale with selected stroke lengths
function getLayout() {
  // Horizontal: map 100–1000 mm stroke → 140–460 px gap between stations
  const hFrac = Math.max(0, Math.min(1, (state.horizStroke - 100) / 900));
  const gap = 140 + hFrac * 320;
  const pickupX  = Math.round(CW / 2 - gap / 2);
  const dropoffX = Math.round(CW / 2 + gap / 2);

  // Vertical: rail moves UP with longer stroke so gripper always reaches the part
  // 50mm stroke → 70px travel, 300mm stroke → 210px travel
  const vFrac = Math.max(0, Math.min(1, (state.vertStroke - 50) / 250));
  const vertPixels = Math.round(70 + vFrac * 140);
  const restY  = GRIPPER_DOWN_Y - vertPixels;          // where gripper parks (top of travel)
  const railY  = Math.max(20, restY - RAIL_H);         // rail sits above restY
  const realRestY = railY + RAIL_H;                    // snap restY to actual rail bottom

  const RAIL_X1 = Math.max(20,       pickupX  - 50);
  const RAIL_X2 = Math.min(CW - 20,  dropoffX + 50);

  return { pickupX, dropoffX, restY: realRestY, railY, RAIL_X1, RAIL_X2 };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function getObjColor() {
  const obj = (SCENARIO_OBJECTS[state.scenario] || []).find(o => o.id === state.object);
  return obj ? obj.color : '#FDD835';
}

function getObjLabel() {
  const obj = (SCENARIO_OBJECTS[state.scenario] || []).find(o => o.id === state.object);
  return obj ? obj.label : 'Part';
}

// Compute per-phase gripper positions using dynamic layout
function getPhasePositions() {
  const { pickupX, dropoffX, restY } = getLayout();
  const downY = GRIPPER_DOWN_Y;
  return [
    { gx0: pickupX,  gy0: restY,  gx1: pickupX,  gy1: downY,  jaw0: JAW_OPEN,   jaw1: JAW_OPEN   },
    { gx0: pickupX,  gy0: downY,  gx1: pickupX,  gy1: downY,  jaw0: JAW_OPEN,   jaw1: JAW_CLOSED },
    { gx0: pickupX,  gy0: downY,  gx1: pickupX,  gy1: restY,  jaw0: JAW_CLOSED, jaw1: JAW_CLOSED },
    { gx0: pickupX,  gy0: restY,  gx1: dropoffX, gy1: restY,  jaw0: JAW_CLOSED, jaw1: JAW_CLOSED },
    { gx0: dropoffX, gy0: restY,  gx1: dropoffX, gy1: downY,  jaw0: JAW_CLOSED, jaw1: JAW_CLOSED },
    { gx0: dropoffX, gy0: downY,  gx1: dropoffX, gy1: downY,  jaw0: JAW_CLOSED, jaw1: JAW_OPEN   },
    { gx0: dropoffX, gy0: downY,  gx1: dropoffX, gy1: restY,  jaw0: JAW_OPEN,   jaw1: JAW_OPEN   },
    { gx0: dropoffX, gy0: restY,  gx1: pickupX,  gy1: restY,  jaw0: JAW_OPEN,   jaw1: JAW_OPEN   }
  ];
}

function drawScene(ctx, gripperX, gripperY, jaw) {
  const { pickupX, dropoffX, restY, railY, RAIL_X1, RAIL_X2 } = getLayout();

  ctx.clearRect(0, 0, CW, CH);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, '#1A2235');
  bg.addColorStop(1, '#0D1520');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // Floor line
  ctx.strokeStyle = '#2D3A50';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, PLATFORM_Y + PLATFORM_H + 2); ctx.lineTo(CW - 40, PLATFORM_Y + PLATFORM_H + 2); ctx.stroke();

  // Rail beam — position is dynamic based on vertical stroke
  const railGrad = ctx.createLinearGradient(0, railY, 0, railY + RAIL_H);
  railGrad.addColorStop(0, '#607D8B'); railGrad.addColorStop(1, '#37474F');
  ctx.fillStyle = railGrad;
  ctx.beginPath();
  ctx.roundRect(RAIL_X1, railY, RAIL_X2 - RAIL_X1, RAIL_H, 4);
  ctx.fill();

  // Rail mounting brackets
  [RAIL_X1 + 20, RAIL_X2 - 20].forEach(bx => {
    ctx.fillStyle = '#455A64';
    ctx.fillRect(bx - 8, 20, 16, railY - 20);
    ctx.fillStyle = '#546E7A';
    ctx.fillRect(bx - 12, 14, 24, 10);
  });

  // Pickup platform
  ctx.fillStyle = '#37474F';
  ctx.beginPath(); ctx.roundRect(pickupX - PLATFORM_W/2, PLATFORM_Y, PLATFORM_W, PLATFORM_H, 3); ctx.fill();
  ctx.fillStyle = '#455A64';
  ctx.fillRect(pickupX - 4, PLATFORM_Y + PLATFORM_H, 8, 20);

  // Dropoff platform
  ctx.fillStyle = '#37474F';
  ctx.beginPath(); ctx.roundRect(dropoffX - PLATFORM_W/2, PLATFORM_Y, PLATFORM_W, PLATFORM_H, 3); ctx.fill();
  ctx.fillStyle = '#455A64';
  ctx.fillRect(dropoffX - 4, PLATFORM_Y + PLATFORM_H, 8, 20);

  // Labels
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.fillStyle = '#78909C';
  ctx.textAlign = 'center';
  ctx.fillText('PICKUP', pickupX,  PLATFORM_Y + PLATFORM_H + 30);
  ctx.fillText('DROPOFF', dropoffX, PLATFORM_Y + PLATFORM_H + 30);

  const objColor = getObjColor();
  const pickupObjY = PLATFORM_Y - OBJ_H;

  // Stacked dropped objects at dropoff
  dropObjects.forEach((_, i) => {
    const stackY = pickupObjY - i * (OBJ_H + 2);
    drawObject(ctx, dropoffX, stackY, objColor, 0.7);
  });

  // Object at pickup (if not holding)
  if (!holding) {
    drawObject(ctx, pickupX, pickupObjY, objColor, 1);
  }

  // Build time — bottom left
  if (window._buildTime) {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#37474F';
    ctx.textAlign = 'left';
    ctx.fillText('Build: ' + window._buildTime, 6, CH - 6);
  }

  // Stroke dimension labels — top left
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.fillStyle = '#546E7A';
  ctx.textAlign = 'left';
  ctx.fillText(`↕ ${state.vertStroke} mm`, 8, railY - 6 > 16 ? railY - 6 : railY + RAIL_H + 14);
  ctx.fillText(`↔ ${state.horizStroke} mm`, 8, (railY - 6 > 16 ? railY - 6 : railY + RAIL_H + 14) + 13);

  // Vertical rod from rail bottom to gripper body
  const rodTop = restY;
  const rodBot = gripperY;
  if (rodBot > rodTop) {
    ctx.strokeStyle = '#546E7A';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(gripperX, rodTop); ctx.lineTo(gripperX, rodBot); ctx.stroke();
  }
  // Rail slider block — always visible at current horizontal position
  ctx.fillStyle = '#607D8B';
  ctx.beginPath(); ctx.roundRect(gripperX - 14, railY - 2, 28, RAIL_H + 4, 3); ctx.fill();

  // Held object (moves with gripper)
  if (holding) {
    drawObject(ctx, gripperX, gripperY + 20, objColor, 1);
  }

  // Gripper body
  drawGripper(ctx, gripperX, gripperY, jaw);

  // Cycle counter
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillStyle = '#78909C';
  ctx.textAlign = 'right';
  ctx.fillText('Cycle #' + (cycleCount + 1), CW - 14, 22);

  // Throughput overlay
  if (cycleCount > 0) {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#4CAF50';
    ctx.textAlign = 'right';
    const result = calcCycleTime();
    if (result) {
      const pph = Math.floor(3600 / result.total);
      ctx.fillText(pph.toLocaleString() + ' pph', CW - 14, 38);
    }
  }

  // Phase color strip at top
  const result = calcCycleTime();
  if (result && result.phases[simPhaseIdx]) {
    const ph = result.phases[simPhaseIdx];
    ctx.fillStyle = ph.color + '33';
    ctx.fillRect(0, 0, CW, 6);
    ctx.fillStyle = ph.color;
    ctx.fillRect(0, 0, CW * easeInOut(phaseProgress), 6);
  }
}

function drawObject(ctx, cx, topY, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(cx - OBJ_W/2, topY, OBJ_W, OBJ_H, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGripper(ctx, cx, cy, gap) {
  const bodyW = 36, bodyH = 14;
  const jawW = 9, jawH = 16;

  // Body
  const gGrad = ctx.createLinearGradient(cx - bodyW/2, cy, cx + bodyW/2, cy);
  gGrad.addColorStop(0, '#78909C'); gGrad.addColorStop(1, '#546E7A');
  ctx.fillStyle = gGrad;
  ctx.beginPath(); ctx.roundRect(cx - bodyW/2, cy, bodyW, bodyH, 3); ctx.fill();

  // Left jaw
  ctx.fillStyle = '#90A4AE';
  ctx.beginPath(); ctx.roundRect(cx - gap/2 - jawW, cy + bodyH - 4, jawW, jawH, [0,0,3,3]); ctx.fill();
  // Right jaw
  ctx.beginPath(); ctx.roundRect(cx + gap/2, cy + bodyH - 4, jawW, jawH, [0,0,3,3]); ctx.fill();

  // Jaw highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(cx - gap/2 - jawW, cy + bodyH - 4, jawW, jawH, [0,0,3,3]); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(cx + gap/2, cy + bodyH - 4, jawW, jawH, [0,0,3,3]); ctx.stroke();
}

// ─── ANIMATION LOOP ───────────────────────────────────────────────
function initCanvas() {
  const canvas = document.getElementById('sim-canvas');
  // Scale for display
  canvas.style.width = '100%';
  simPaused = false;
  cycleCount = 0;
  simPhaseIdx = 0;
  phaseProgress = 0;
  lastTimestamp = null;
  holding = false;
  jawGap = JAW_OPEN;
  dropObjects = [];
  document.getElementById('btn-play-pause').textContent = '⏸ Pause';
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(animLoop);
}

function animLoop(ts) {
  if (simPaused) { animId = requestAnimationFrame(animLoop); return; }

  const canvas = document.getElementById('sim-canvas');
  const ctx = canvas.getContext('2d');
  const result = calcCycleTime();
  if (!result) return;

  if (!lastTimestamp) lastTimestamp = ts;
  const elapsed = (ts - lastTimestamp) / 1000; // seconds
  lastTimestamp = ts;

  const phase = result.phases[simPhaseIdx];
  const phaseDur = phase.time / speedMult;
  phaseProgress = Math.min(1, phaseProgress + elapsed / phaseDur);

  const t = easeInOut(phaseProgress);
  const positions = getPhasePositions();
  const pos = positions[simPhaseIdx];

  const gripperX = lerp(pos.gx0, pos.gx1, t);
  const gripperY = lerp(pos.gy0, pos.gy1, t);
  jawGap = lerp(pos.jaw0, pos.jaw1, t);

  // Update holding state at phase transitions
  if (simPhaseIdx === 1 && phaseProgress >= 1) holding = true;   // after grip
  if (simPhaseIdx === 5 && phaseProgress >= 1) {                  // after release
    holding = false;
    dropObjects.push({ ts });
    if (dropObjects.length > 4) dropObjects.shift();
  }

  drawScene(ctx, gripperX, gripperY, jawGap);
  updatePhaseBar(simPhaseIdx);

  if (phaseProgress >= 1) {
    phaseProgress = 0;
    simPhaseIdx++;
    if (simPhaseIdx >= result.phases.length) {
      simPhaseIdx = 0;
      cycleCount++;
    }
  }

  animId = requestAnimationFrame(animLoop);
}

function togglePlayPause() {
  simPaused = !simPaused;
  const btn = document.getElementById('btn-play-pause');
  btn.textContent = simPaused ? '▶ Resume' : '⏸ Pause';
  if (!simPaused) { lastTimestamp = null; }
}

function restartSim() {
  simPhaseIdx = 0; phaseProgress = 0; cycleCount = 0;
  holding = false; jawGap = JAW_OPEN; dropObjects = [];
  lastTimestamp = null; simPaused = false;
  document.getElementById('btn-play-pause').textContent = '⏸ Pause';
}

function setSpeed(val) {
  speedMult = parseFloat(val);
}

// ─── EXPOSE GLOBALS ───────────────────────────────────────────────
window.selectScenario  = selectScenario;
window.goToConfigure   = goToConfigure;
window.goToSimulate    = goToSimulate;
window.selectAxisMode  = selectAxisMode;
window.selectObject    = selectObject;
window.selectGripper   = selectGripper;
window.selectVert      = selectVert;
window.selectHoriz     = selectHoriz;
window.selectCombo     = selectCombo;
window.updateWeight    = updateWeight;
window.resetConfig     = resetConfig;
window.selectVertStroke  = selectVertStroke;
window.selectHorizStroke = selectHorizStroke;
window.togglePlayPause = togglePlayPause;
window.restartSim      = restartSim;
window.setSpeed        = setSpeed;

// ─── BUILD TIME ───────────────────────────────────────────────────
fetch('/api/version')
  .then(r => r.json())
  .then(d => {
    window._buildTime = new Date(d.buildTime).toLocaleString();
  })
  .catch(() => {
    window._buildTime = new Date().toLocaleString() + ' (local)';
  });

// ─── CANVAS ROUNDRECT POLYFILL ────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    const [tl=0, tr=0, br=0, bl=0] = r;
    this.beginPath();
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y); this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br); this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h); this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl); this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
  };
}
