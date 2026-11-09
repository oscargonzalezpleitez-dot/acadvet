const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Ejecuta el controlador real sin cargar Firebase ni abrir una sesión real.
const source = fs.readFileSync(path.join(__dirname, '../js/registro.js'), 'utf8')
  .replace(/^import\s[\s\S]*?;\r?\n/gm, '')
  .replace(/^init\(\);\r?\n/m, '');

function setup(positions = []) {
  const elements = new Map();
  const calls = [];
  const writes = [];
  const node = id => {
    if (!elements.has(id)) {
      const classes = new Set(['stSelfie', 'stSuccess', 'stError'].includes(id) ? ['hidden'] : []);
      elements.set(id, {
        value: '', textContent: '', disabled: false, style: {},
        classList: {
          add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
          toggle: (c, add) => add ? classes.add(c) : classes.delete(c),
        },
        focus() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector() { return node(`${id}-text`); },
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    console: { error() {}, warn() {} }, URLSearchParams,
    window: { location: { search: '?s=test&tk=ABC-123' } },
    document: { getElementById: node, querySelector: () => null },
    navigator: {
      userAgent: 'iPhone Safari',
      geolocation: {
        getCurrentPosition(ok, fail, options) {
          calls.push(options);
          const next = positions.shift();
          if (!next) throw new Error('Unexpected GPS request');
          queueMicrotask(() => next.error ? fail(next.error) : ok({ coords: next }));
        },
      },
    },
    getDatabase: () => ({}), getAuth: () => ({ currentUser: { uid: 'test' } }), app: {},
    signInAnonymously: async () => {},
    onValue: (_ref, callback) => { callback({ val: () => 0 }); return () => {}; },
    ref: (_db, target) => target,
    get: async () => ({ val: () => context.session, exists: () => true }),
    update: async (_ref, payload) => writes.push(payload),
  });
  vm.runInContext(source, context);
  vm.runInContext('_cfg = { requireGeo: true, aulaLat: 13.7, aulaLng: -89.2, geoRadius: 100 };', context);
  return { context, node, calls, writes, run: code => vm.runInContext(code, context) };
}

test('admite el token vigente con espacios, minúsculas y guion de teclado móvil', () => {
  const h = setup();
  assert.equal(h.run("requireSessionToken({ active: true, token: 'ABC-123' }, ' abc–123 ')"), 'ABC-123');
  assert.equal(h.run("requireSessionToken({ active: true, token: 'ABC-123' }, 'abc123')"), 'ABC-123');
});

test('respeta la gracia del token anterior y rechaza al vencer, usando el reloj del servidor', () => {
  const h = setup();
  h.context.session = { active: true, token: 'DEF-456', prevToken: 'ABC-123', prevTokenExpiresAt: Date.now() + 30000 };
  assert.equal(h.run("requireSessionToken(session, 'ABC-123')"), 'ABC-123');
  h.run('_serverTimeOffset = 60000');
  assert.throws(() => h.run("requireSessionToken(session, 'ABC-123')"), { code: 'qr/token-expired' });
  assert.throws(() => h.run("requireSessionToken(session, 'XXX-999')"), { code: 'qr/token-expired' });
});

test('una sesión cerrada nunca acepta el token vigente', () => {
  const h = setup();
  assert.throws(() => h.run("requireSessionToken({ active: false, token: 'ABC-123' }, 'ABC-123')"), { code: 'qr/session-ended' });
});

test('GPS: reemplaza la lectura aproximada fuera del aula por otra precisa y nueva', async () => {
  const h = setup([
    { latitude: 13.71, longitude: -89.2, accuracy: 1500 },
    { latitude: 13.7, longitude: -89.2, accuracy: 15 },
  ]);
  await h.run('startGPS()');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].enableHighAccuracy, true);
  assert.equal(h.calls[1].maximumAge, 0);
  assert.equal(h.run('_gpsCoords.accuracy'), 15);
  assert.match(h.node('gpsStatusText').textContent, /dentro del radio/);
});

test('GPS: una lectura dentro del aula pero imprecisa también se afina', async () => {
  const h = setup([
    { latitude: 13.7, longitude: -89.2, accuracy: 1200 },
    { latitude: 13.7, longitude: -89.2, accuracy: 10 },
  ]);
  await h.run('startGPS()');
  assert.equal(h.calls.length, 2);
  assert.equal(h.run('_gpsCoords.accuracy'), 10);
});

test('GPS: conserva la mejor lectura si falla el segundo intento y deja reintentar', async () => {
  const h = setup([
    { latitude: 13.71, longitude: -89.2, accuracy: 1200 },
    { error: { code: 3 } },
  ]);
  await h.run('startGPS()');
  assert.equal(h.run('_gpsCoords.accuracy'), 1200);
  assert.match(h.node('gpsStatusText').textContent, /código de acceso/);
  assert.equal(h.node('gpsRetryBtn').classList.contains('hidden'), false);
});

test('GPS: los permisos denegados muestran ayuda para Safari sin insistir automáticamente', async () => {
  const h = setup([{ error: { code: 1 } }]);
  await h.run('startGPS()');
  assert.equal(h.calls.length, 1);
  assert.equal(h.run('_gpsCoords'), null);
  assert.match(h.node('gpsStatusText').textContent, /Safari/);
  assert.equal(h.node('gpsRetryBtn').classList.contains('hidden'), false);
});

test('GPS: comparte una petición en curso y no falla si el navegador carece de geolocalización', async () => {
  const h = setup([{ latitude: 13.7, longitude: -89.2, accuracy: 10 }]);
  const first = h.run('startGPS()');
  assert.equal(h.run('startGPS()'), first);
  await first;
  assert.equal(h.calls.length, 1);
  h.context.navigator.geolocation = undefined;
  await h.run('startGPS()');
  assert.equal(h.run('_gpsCoords'), null);
  assert.match(h.node('gpsStatusText').textContent, /No se pudo obtener/);
});

test('la selfie revalida el código antes de escribir y vuelve al formulario si venció', async () => {
  const h = setup();
  h.context.session = { active: true, token: 'DEF-456', prevToken: 'ABC-123', prevTokenExpiresAt: Date.now() - 1000 };
  h.run("_formData = { nombre: 'Alumno', carnet: '123', token: 'ABC-123', asistKey: 'unico_123' }; _selfieB64 = 'foto'; show('stSelfie');");
  await h.run('handleSendSelfie()');
  assert.equal(h.writes.length, 0);
  assert.equal(h.node('stForm').classList.contains('hidden'), false);
  assert.match(h.node('rTokenErr').textContent, /venció/);
  assert.equal(h.node('btnSendSelfie').disabled, false);
});

test('un error de red al enviar se ve en la selfie y permite reintentar', async () => {
  const h = setup();
  h.context.get = async () => { throw new Error('offline'); };
  h.run("_selfieB64 = 'foto'; show('stSelfie');");
  await h.run('handleSendSelfie()');
  assert.equal(h.node('selfieStatus').classList.contains('hidden'), false);
  assert.match(h.node('selfieStatus').textContent, /conexión/);
  assert.equal(h.node('btnSendSelfie').disabled, false);
});

test('envía el token canónico anterior dentro de gracia y mantiene atómicos registro e índice', async () => {
  const h = setup();
  h.context.session = { active: true, token: 'DEF-456', prevToken: 'ABC-123', prevTokenExpiresAt: Date.now() + 30000 };
  h.context.get = async target => ({
    val: () => h.context.session,
    exists: () => target === 'qr_sessions/test',
  });
  h.node('rNombre').value = 'Alumno';
  h.node('rCarnet').value = '123';
  h.node('rToken').value = 'abc123';
  h.run("_cfg.requireGeo = false; _cfg.onceDevice = true; _deviceId = 'telefono';");
  await h.run('handleStep1()');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0]['qr_sessions/test/asistentes/unico_123'].token, 'ABC-123');
  assert.equal(h.writes[0]['qr_sessions/test/device_index/telefono'], true);
  assert.equal(h.node('stSuccess').classList.contains('hidden'), false);
});

test('la carga inicial no usa get() para /.info y abre el formulario aunque falle la sincronización', async () => {
  const h = setup();
  const reads = [];
  h.context.session = { active: true, materiaNombre: 'Bacteriología', config: {} };
  h.context.onValue = (target, _ok, fail) => {
    assert.equal(target, '.info/serverTimeOffset');
    fail({ code: 'PERMISSION_DENIED' });
    return () => {};
  };
  h.context.get = async target => {
    reads.push(target);
    if (target.startsWith('.info')) throw new Error('get() no debe consultar metadatos');
    return { val: () => h.context.session, exists: () => true };
  };
  await h.run('init()');
  assert.deepEqual(reads, ['qr_sessions/test']);
  assert.equal(h.node('stForm').classList.contains('hidden'), false);
  assert.equal(h.node('stError').classList.contains('hidden'), true);
});

test('una excepción al iniciar el reloj tampoco bloquea el registro', async () => {
  const h = setup();
  h.context.session = { active: true, config: {} };
  h.context.onValue = () => { throw new Error('metadata unavailable'); };
  await h.run('init()');
  assert.equal(h.node('stForm').classList.contains('hidden'), false);
});

test('el reloj se actualiza sin bloquear y no acumula suscripciones al reintentar', async () => {
  const h = setup();
  h.context.session = { active: true, config: {} };
  let subscriptions = 0;
  h.context.onValue = (_target, callback) => {
    subscriptions++;
    callback({ val: () => 4500 });
    return () => {};
  };
  await h.run('init()');
  await h.run('init()');
  assert.equal(subscriptions, 1);
  assert.equal(h.run('_serverTimeOffset'), 4500);
});

test('un rechazo de Firebase se identifica como permisos y permite reintentar la carga', async () => {
  const h = setup();
  h.context.get = async () => { throw Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' }); };
  await h.run('init()');
  assert.equal(h.node('stError').classList.contains('hidden'), false);
  assert.match(h.node('errMsg').textContent, /permisos/);
  assert.match(h.node('errMsg').textContent, /session\/PERMISSION_DENIED/);
  assert.doesNotMatch(h.node('errMsg').textContent, /Verificá tu internet/);
  h.context.session = { active: true, config: {} };
  h.context.get = async () => ({ val: () => h.context.session, exists: () => true });
  await h.run('init()');
  assert.equal(h.node('stForm').classList.contains('hidden'), false);
  assert.equal(h.node('stError').classList.contains('hidden'), true);
});

test('un error de autenticación muestra su código y no intenta consultar la sesión', async () => {
  const h = setup();
  h.run('auth.currentUser = null');
  h.context.signInAnonymously = async () => { throw Object.assign(new Error('disabled'), { code: 'auth/operation-not-allowed' }); };
  h.context.get = async () => { assert.fail('No se debe leer sin autenticar'); };
  await h.run('init()');
  assert.match(h.node('errMsg').textContent, /autenticación anónima/);
  assert.match(h.node('errMsg').textContent, /auth\/operation-not-allowed/);
  assert.equal(h.node('errTitle').textContent, 'No se pudo abrir el registro');
});
