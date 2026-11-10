const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const helpers = fs.readFileSync(path.join(root, 'js/quiz-exits.js'), 'utf8').replace(/export /g, '');
const view = fs.readFileSync(path.join(root, 'js/views/cuestionarios.js'), 'utf8')
  .replace(/^import\s[\s\S]*?;/gm, '').replace(/export /g, '');

const context = () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; }, remove() {},
      querySelectorAll: () => [],
    });
    return nodes.get(id);
  };
  let modal;
  const ctx = vm.createContext({ document: { getElementById: node },
    sessionStorage: { getItem: () => '' }, openModal: value => { modal = value; },
  });
  vm.runInContext(helpers + '\n' + view, ctx);
  return { ctx, node, modal: () => modal };
};

test('mide tiempo exacto, agrupa señales y permite una nueva salida después del regreso', () => {
  const { ctx } = context();
  const value = vm.runInContext(`(() => {
    const events = [];
    beginExit(events, { now: 1000, question: 3, questionIndex: 7, source: 'blur' });
    beginExit(events, { now: 1100, question: 3, questionIndex: 7, source: 'visibility' });
    finishExit(events, 8100);
    finishExit(events, 9000);
    beginExit(events, { now: 10000, question: 4, questionIndex: 2, source: 'visibility' });
    finishExit(events, 12000, 'delivery');
    return exitSummary({ exitTrackingVersion: 1, blurs: 2, exitEvents: events });
  })()`, ctx);
  assert.equal(value.events.length, 2);
  assert.equal(value.totalMs, 9100);
  assert.equal(value.events[0].questionIndex, 7);
  assert.equal(value.events[1].endedBy, 'delivery');
});

test('filtros combinados respetan umbrales y excluyen duraciones históricas desconocidas', () => {
  const { ctx } = context();
  const run = expression => vm.runInContext(expression, ctx);
  run("globalThis.result = {blurs: 3, exitTrackingVersion: 1, exitEvents: [{durationMs: 30000}], forzadoPorSalidas: true}");
  assert.equal(run('matchesExitFilter(result, {minimumCount: 3, minimumSeconds: 30, forcedOnly: true})'), true);
  assert.equal(run('matchesExitFilter(result, {minimumSeconds: 31})'), false);
  assert.equal(run('matchesExitFilter({blurs: 5}, {minimumSeconds: 10})'), false);
  assert.equal(run('matchesExitFilter({blurs: 5}, {minimumCount: 3})'), true);
  assert.equal(run("formatExitDuration(exitSummary({blurs: 5}).totalMs)"), 'Sin registro');
});

test('recuperación cierra ausencia sin extenderla más allá del vencimiento', () => {
  const { ctx } = context();
  vm.runInContext("globalThis.events = [{startedAt: 1000, endedAt: null, sources: ['blur']}]; finishExit(events, 6000, 'recovery')", ctx);
  assert.equal(vm.runInContext('events[0].durationMs', ctx), 5000);
  assert.equal(vm.runInContext('events[0].endedBy', ctx), 'recovery');
});

test('el panel combina cuestionario y filtros de salidas, y muestra duración', () => {
  const { ctx, node } = context();
  const el = node('results');
  ctx.el = el;
  vm.runInContext(`_results = [
    {id:'a', cuestionarioId:'quiz1', alumno:{nombre:'ALFA'}, blurs:3, exitTrackingVersion:1, exitEvents:[{durationMs:40000}]},
    {id:'b', cuestionarioId:'quiz1', alumno:{nombre:'BETA'}, blurs:1, exitTrackingVersion:1, exitEvents:[{durationMs:2000}]},
    {id:'c', cuestionarioId:'quiz2', alumno:{nombre:'GAMMA'}, blurs:4, exitTrackingVersion:1, exitEvents:[{durationMs:50000}]}
  ]; _filterQuizId='quiz1'; _exitFilter={minimumCount:3, minimumSeconds:30, forcedOnly:false}; paintResultados(el);`, ctx);
  assert.match(el.innerHTML, /ALFA/);
  assert.doesNotMatch(el.innerHTML, /BETA|GAMMA/);
  assert.match(el.innerHTML, /40 s/);
  assert.ok(node('filterExitTime').listeners.change);
});

test('el detalle docente distingue regreso, recuperación y entrega, e identifica la pregunta vista', () => {
  const { ctx, modal } = context();
  vm.runInContext(`openResultadoModal({alumno:{nombre:'Alumno'}, blurs:1, exitTrackingVersion:1,
    exitEvents:[{question:4, startedAt:1000, endedAt:21000, durationMs:20000, endedBy:'delivery'}]})`, ctx);
  assert.match(modal().body, /Pregunta vista/);
  assert.match(modal().body, /<td>4<\/td>/);
  assert.match(modal().body, /20 s/);
  assert.match(modal().body, /Entrega durante la salida/);
  assert.doesNotMatch(modal().body, />Regresó</);
});
