// =============================================================================
// AcadVet USAM — Módulo 3: Calculadora de Laboratorio
// =============================================================================

const HISTORY_KEY = 'acadvet_calc_history';
const HISTORY_MAX = 20;

// ── Conversión de unidades de concentración a base (mg/mL) ──────────────────
const CONC_TO_MGML = {
  'mg/mL':    1,
  'mg/dL':    0.01,
  'g/L':      1,
  'g/dL':     10,
  'µg/mL':    0.001,
  'µg/dL':    0.00001,
  'mmol/L':   null, // requiere PM
  '%':        10,
  'ppm':      0.001,
};

// ── Conversión de unidades de volumen a base (mL) ───────────────────────────
const VOL_TO_ML = {
  'mL':  1,
  'µL':  0.001,
  'L':   1000,
  'dL':  100,
};

export function convertVolume(value, unit) {
  const factor = VOL_TO_ML[unit];
  if (factor == null) throw new Error(`Unidad de volumen desconocida: ${unit}`);
  return value * factor;
}

export function convertConcentration(value, unit) {
  const factor = CONC_TO_MGML[unit];
  if (factor == null) throw new Error(`Unidad "${unit}" requiere peso molecular`);
  return value * factor;
}

// ── 1. Dilución simple C₁V₁ = C₂V₂ ─────────────────────────────────────────
// Pasa null en la variable a calcular
export function calculateDilution({ C1, V1, C2, V2, unitC1 = 'mg/mL', unitV1 = 'mL', unitC2 = 'mg/mL', unitV2 = 'mL' }) {
  const toBase = (v, u, type) => type === 'conc' ? convertConcentration(v, u) : convertVolume(v, u);

  const nullCount = [C1, V1, C2, V2].filter(x => x == null).length;
  if (nullCount !== 1) throw new Error('Dejá exactamente un campo vacío para calcular');

  let c1 = C1 != null ? toBase(C1, unitC1, 'conc') : null;
  let v1 = V1 != null ? toBase(V1, unitV1, 'vol')  : null;
  let c2 = C2 != null ? toBase(C2, unitC2, 'conc') : null;
  let v2 = V2 != null ? toBase(V2, unitV2, 'vol')  : null;

  let unknown, result;
  if (c1 == null) { unknown = 'C₁'; result = (c2 * v2) / v1; c1 = result; }
  else if (v1 == null) { unknown = 'V₁'; result = (c2 * v2) / c1; v1 = result; }
  else if (c2 == null) { unknown = 'C₂'; result = (c1 * v1) / v2; c2 = result; }
  else                 { unknown = 'V₂'; result = (c1 * v1) / c2; v2 = result; }

  if (!isFinite(result) || result <= 0) throw new Error('Resultado no válido — revisá los valores');

  const ratio = Math.round(v2 / v1);
  const solventNeeded = v2 - v1;

  const warnings = [];
  if (ratio > 1000) warnings.push('⚠️ Dilución muy alta (> 1:1000) — considerá diluciones en serie');
  if (v2 < 0.001) warnings.push('⚠️ Volumen resultante < 1 µL — no es práctico');
  if (solventNeeded < 0) warnings.push('⚠️ V₂ menor que V₁ — verificá los datos');

  return {
    unknown,
    result,
    resultML: unknown.includes('V') ? result : null,
    ratio,
    solventNeeded: solventNeeded > 0 ? solventNeeded : 0,
    finalVolume: v2,
    warnings,
    steps: buildDilutionSteps({ c1, v1, c2, v2, unknown, result }),
  };
}

function buildDilutionSteps({ c1, v1, c2, v2, unknown, result }) {
  return [
    `Fórmula: C₁ × V₁ = C₂ × V₂`,
    `Despejando ${unknown}: ${unknown} = ${unknown.startsWith('C') ? `(${fmt(unknown === 'C₁' ? c2 : c1)} × ${fmt(unknown === 'C₁' ? v2 : v1)}) / ${fmt(unknown === 'C₁' ? v1 : v2)}` : `(${fmt(c1)} × ${fmt(v1)}) / ${fmt(unknown === 'V₁' ? c2 : c1)}`}`,
    `${unknown} = ${fmt(result)} ${unknown.startsWith('C') ? 'mg/mL' : 'mL'}`,
  ];
}

// ── 2. Diluciones en serie ───────────────────────────────────────────────────
export function calculateSerialDilution(initialConc, dilutionFactor, steps) {
  if (dilutionFactor <= 1) throw new Error('El factor de dilución debe ser > 1');
  if (steps < 1 || steps > 12) throw new Error('Número de diluciones: entre 1 y 12');

  const rows = [];
  for (let i = 1; i <= steps; i++) {
    const conc = initialConc / Math.pow(dilutionFactor, i);
    const exp  = -i * Math.log10(dilutionFactor);
    rows.push({
      step:    i,
      label:   `1:${Math.pow(dilutionFactor, i).toExponential(0).replace('e+', '×10^')}`,
      exponent: exp.toFixed(1),
      concentration: conc,
      concFormatted: conc < 0.001 ? conc.toExponential(2) : fmt(conc),
    });
  }
  return rows;
}

// ── 3. Conversiones de unidades ──────────────────────────────────────────────
const UNIT_CONVERSIONS = {
  // concentración: todo a mg/dL como base
  'mg/dL':   { base: 'mg/dL', factor: 1 },
  'g/L':     { base: 'mg/dL', factor: 100 },
  'g/dL':    { base: 'mg/dL', factor: 1000 },
  'mg/L':    { base: 'mg/dL', factor: 0.1 },
  'µg/mL':   { base: 'mg/dL', factor: 0.1 },
  'µg/dL':   { base: 'mg/dL', factor: 0.001 },
  'ng/mL':   { base: 'mg/dL', factor: 0.0001 },
  'mg/mL':   { base: 'mg/dL', factor: 100 },
  'ppm':     { base: 'mg/dL', factor: 0.1 },
  '%':       { base: 'mg/dL', factor: 1000 },
};

export function convertUnits(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  const from = UNIT_CONVERSIONS[fromUnit];
  const to   = UNIT_CONVERSIONS[toUnit];
  if (!from || !to) throw new Error(`Conversión no soportada: ${fromUnit} → ${toUnit}`);
  if (from.base !== to.base) throw new Error('Unidades incompatibles');
  const baseValue = value * from.factor;
  return baseValue / to.factor;
}

// ── 4. pH ↔ [H⁺] ────────────────────────────────────────────────────────────
export function calculateHPlus(pH) {
  const warnings = [];
  if (pH < 0 || pH > 14) warnings.push('⚠️ pH fuera del rango fisiológico (0–14)');
  if (pH < 6.8 || pH > 7.8) warnings.push('⚠️ pH fuera del rango biológico típico (6.8–7.8)');
  const hPlus = Math.pow(10, -pH);
  return { hPlus, hPlusFormatted: hPlus.toExponential(3), warnings };
}

export function calculatePH(hPlus) {
  if (hPlus <= 0) throw new Error('[H⁺] debe ser mayor que 0');
  const pH = -Math.log10(hPlus);
  const warnings = [];
  if (pH < 0 || pH > 14) warnings.push('⚠️ Resultado fuera del rango 0–14');
  return { pH: +pH.toFixed(4), warnings };
}

// ── 5. CFU ↔ Log₁₀ ──────────────────────────────────────────────────────────
export function calculateLog(cfu) {
  if (cfu <= 0) throw new Error('CFU debe ser mayor que 0');
  return { log: +Math.log10(cfu).toFixed(4) };
}

export function calculateCFU(log) {
  const cfu = Math.pow(10, log);
  return { cfu, cfuFormatted: cfu.toExponential(2) };
}

// ── 6. Molaridad, Molalidad, Osmolaridad ────────────────────────────────────
export function calculateMolarity({ masaG, pesoMolecular, volumenL, solutosIonicos = 1 }) {
  if (pesoMolecular <= 0) throw new Error('Peso molecular debe ser > 0');
  if (volumenL <= 0) throw new Error('Volumen debe ser > 0');

  const moles     = masaG / pesoMolecular;
  const molaridad = moles / volumenL;        // mol/L
  const molalidad = moles / 1;               // mol/kg (asume 1 kg disolvente aprox)
  const osmolaridad = molaridad * solutosIonicos;

  return {
    moles:      +moles.toFixed(4),
    molaridad:  +molaridad.toFixed(4),
    molalidad:  +molalidad.toFixed(4),
    osmolaridad:+osmolaridad.toFixed(4),
  };
}

// ── Validación genérica ──────────────────────────────────────────────────────
export function validateInput(value, min, max) {
  if (isNaN(value))  return { valid: false, msg: 'Ingresá un número válido' };
  if (value < min)   return { valid: false, msg: `Valor mínimo: ${min}` };
  if (value > max)   return { valid: false, msg: `Valor máximo: ${max}` };
  return { valid: true, msg: '' };
}

// ── Historial localStorage ───────────────────────────────────────────────────
export function saveCalculation(type, inputs, result) {
  const history = getCalculationHistory();
  history.unshift({ type, inputs, result, ts: Date.now() });
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getCalculationHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '?';
  if (Math.abs(n) < 0.001 || Math.abs(n) > 99999) return (+n).toExponential(3);
  return (+n.toFixed(4)).toString();
}
