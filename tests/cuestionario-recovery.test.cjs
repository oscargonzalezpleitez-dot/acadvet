const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const recoverySource = fs.readFileSync(path.join(root, 'js/quiz-recovery.js'), 'utf8').replace(/export /g, '');
const pageSource = fs.readFileSync(path.join(root, 'cuestionario.html'), 'utf8')
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import\s[\s\S]*?;/gm, '');

async function harness(overrides = {}) {
  const nodes = new Map(), store = new Map(), intervals = [];
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        value: '', textContent: '', innerHTML: '', style: {}, disabled: false,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x),
          contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
        addEventListener() {}, appendChild() {}, querySelectorAll: () => [],
      });
    }
    return nodes.get(id);
  };
  const context = vm.createContext({
    console: { error() {}, warn() {} }, URLSearchParams, Date, Math, Object, JSON, String, Number, Set,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    navigator: { onLine: true, mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, createElement: node },
    window: { addEventListener() {}, removeEventListener() {} },
    location: { search: '?q=quiz1' }, auth: {}, app: {},
    getDatabase() {}, ref: (_, p) => p, get: async () => ({ exists: () => false }),
    signInAnonymously: async () => {},
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {},
    getCuestionarioReceipt: async () => null,
    saveCuestionarioResultado: async () => {},
    remove: async () => {}, set: async () => {},
    ...overrides,
  });
  const api = await vm.runInContext(`(async () => {
    ${recoverySource}
    ${pageSource}
    return { remainingSeconds, readAttempt, writeAttempt, restoreAttempt, submitQuiz, sendPendingResult,
      getState: () => ({ userAnswers, questionOrder, optionOrders, currentPos, deadline, pendingResult, submitted }),
      prepare: saved => { _backupKey = 'backup'; restoreAttempt(saved); },
    };
  })()`, context);
  return { api, node, store, context, intervals };
}

function savedAttempt(extra = {}) {
  return {
    version: 1, quizId: 'quiz1', attemptId: 'attempt1', deadline: Date.now() + 60000,
    quiz: { nombre: 'Examen', tiempo: 30, preguntas: [{ texto: 'Primera', tipo: 'short', puntos: 1 }, { texto: 'Segunda', tipo: 'short', puntos: 1 }] },
    studentData: { carnet: '170964', nombre: 'Alumno' }, userAnswers: { 1: 'respuesta conservada' },
    questionOrder: [1, 0], optionOrders: {}, currentPos: 1, blurCount: 2, blurSnapshots: [], pendingResult: null,
    ...extra,
  };
}

test('recuperar conserva respuestas, orden, posición y vencimiento sin otorgar más tiempo', async () => {
  const { api, store } = await harness();
  const saved = savedAttempt();
  api.prepare(saved);
  const actual = api.getState();
  assert.deepEqual(actual.userAnswers, saved.userAnswers);
  assert.deepEqual(actual.questionOrder, [1, 0]);
  assert.equal(actual.currentPos, 1);
  assert.equal(actual.deadline, saved.deadline);
  assert.equal(JSON.parse(store.get('backup')).userAnswers[1], 'respuesta conservada');
  assert.equal(api.remainingSeconds(10000, 8500), 2);
  assert.equal(api.remainingSeconds(10000, 11000), 0);
});

test('rechaza respaldos corruptos, de otro alumno y del formato antiguo', async () => {
  const { api, context } = await harness();
  const storage = context.localStorage;
  for (const value of ['{', JSON.stringify({ userAnswers: {} }), JSON.stringify(savedAttempt({ questionOrder: [0, 0] }))]) {
    storage.setItem('x', value);
    assert.equal(api.readAttempt(storage, 'x', 'quiz1', '170964'), null);
  }
  storage.setItem('x', JSON.stringify(savedAttempt()));
  assert.equal(api.readAttempt(storage, 'x', 'quiz1', '999999'), null);
  assert.ok(api.readAttempt(storage, 'x', 'quiz1', '170964'));
});

test('fallo de almacenamiento se informa sin romper el intento', async () => {
  const { api } = await harness();
  assert.equal(api.writeAttempt({ setItem() { throw new Error('QuotaExceeded'); } }, 'x', {}), false);
});

test('fallo de envío conserva copia final y muestra reintento visible', async () => {
  const { api, node, store } = await harness({ saveCuestionarioResultado: async () => { throw new Error('Sin red'); } });
  api.prepare(savedAttempt());
  await api.submitQuiz();
  assert.equal(node('vEntrega').classList.contains('hidden'), false);
  assert.equal(node('btnRetryDelivery').disabled, false);
  assert.match(node('deliveryStatus').textContent, /No se confirmó/);
  assert.equal(JSON.parse(store.get('backup')).pendingResult.detalle[1].respuesta, 'respuesta conservada');
  assert.equal(api.getState().submitted, true);
});

test('confirmación perdida se recupera con el mismo comprobante sin otra escritura', async () => {
  let writes = 0;
  const { api, store, node } = await harness({
    getCuestionarioReceipt: async () => ({ cuestionarioId: 'quiz1', carnet: '170964', recibido_en: Date.now() }),
    saveCuestionarioResultado: async () => { writes++; },
  });
  api.prepare(savedAttempt());
  await api.submitQuiz();
  assert.equal(writes, 0);
  assert.equal(api.getState().pendingResult, null);
  assert.equal(store.has('backup'), false);
  assert.equal(node('vResult').classList.contains('hidden'), false);
});

test('el intento vencido entrega automáticamente las respuestas recuperadas', async () => {
  const { api } = await harness({ saveCuestionarioResultado: async () => { throw new Error('Sin red'); } });
  api.prepare(savedAttempt({ deadline: Date.now() - 1000 }));
  await new Promise(resolve => setImmediate(resolve));
  const result = api.getState().pendingResult;
  assert.equal(result.porEntregaTemporal, true);
  assert.equal(result.detalle[1].respuesta, 'respuesta conservada');
});

test('una entrega pendiente nunca vuelve a abrir preguntas ni reconstruye su contenido', async () => {
  const final = { attemptId: 'attempt1', cuestionarioId: 'quiz1', alumno: { carnet: '170964' }, detalle: [{ respuesta: 'final' }] };
  const { api } = await harness({ saveCuestionarioResultado: async () => { throw new Error('Sin red'); } });
  api.prepare(savedAttempt({ pendingResult: final }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.getState().submitted, true);
  assert.deepEqual(api.getState().pendingResult, final);
});

test('los reintentos concurrentes comparten un solo envío en curso', async () => {
  let writes = 0, finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { api } = await harness({ saveCuestionarioResultado: async () => { writes++; await pending; } });
  api.prepare(savedAttempt());
  const sending = api.submitQuiz();
  await new Promise(resolve => setImmediate(resolve));
  await api.sendPendingResult();
  await api.submitQuiz();
  assert.equal(writes, 1);
  finish();
  await sending;
});

test('la capa de datos verifica un recibo después de perder la confirmación de escritura', async () => {
  const source = fs.readFileSync(path.join(root, 'js/db.js'), 'utf8')
    .replace(/^import\s[\s\S]*?;/gm, '').replace(/export /g, '');
  let writes = 0;
  const context = vm.createContext({
    app: {}, auth: { currentUser: { uid: 'alumno1' } },
    getDatabase() {}, getStorage() {}, ref: (_, p) => ({ key: p?.split('/').pop(), path: p }),
    get: async () => ({ exists: () => true, val: () => ({ cuestionarioId: 'quiz1', carnet: '170964' }) }),
    update: async (_, updates) => {
      writes++;
      assert.ok(updates['cuestionarios_resultados/attempt1']);
      assert.equal(updates['cuestionarios_recibos/attempt1'].uid, 'alumno1');
      throw new Error('Confirmación perdida');
    },
  });
  vm.runInContext(source, context);
  const result = await vm.runInContext("saveCuestionarioResultado('quiz1', '170964', {attemptId: 'attempt1'})", context);
  assert.equal(result, 'attempt1');
  assert.equal(writes, 1);
});
