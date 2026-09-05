import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const restoreCode = source.slice(source.indexOf('async function restoreSession('), source.indexOf('\nonAuthStateChanged(auth, restoreSession)'));
const persistenceCode = source.slice(source.indexOf('async function configureSessionPersistence('), source.indexOf('\nawait configureSessionPersistence();'));
function harness(resolveAccess) {
  const state = { authGeneration: 0 }, elements = new Map();
  const calls = { logout: 0, listeners: 0, views: [], checks: 0 };
  const context = {
    state, resolveAccess: async (user) => { calls.checks++; return resolveAccess(user); },
    clearPrivateView() { state.member = null; state.isAdmin = false; },
    showOnly(view) { calls.views.push(view); },
    $(selector) { if (!elements.has(selector)) elements.set(selector, {}); return elements.get(selector); },
    isMaster() { return false; }, renderProfile() {}, switchSection() {},
    startRealtimeListeners() { calls.listeners++; },
    revokeAccess() { state.authGeneration++; state.member = null; calls.views.push('denied'); },
    signOut() { calls.logout++; }, console: { warn() {} }
  };
  vm.createContext(context); vm.runInContext(restoreCode, context);
  return { context, state, calls };
}
const user = { email: 'player@example.invalid' };
test('Error temporal conserva identidad y bloquea datos sin cerrar sesión', async () => {
  const h = harness(() => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); });
  await h.context.restoreSession(user);
  assert.equal(h.calls.logout, 0);
  assert.equal(h.state.user, user);
  assert.equal(h.state.member, null);
  assert.equal(h.calls.listeners, 0);
  assert.equal(h.calls.views.at(-1), 'reconnect');
});
test('Recuperar conexión vuelve a comprobar permisos sin solicitar login', async () => {
  let offline = true;
  const h = harness(() => { if (offline) throw new Error('offline'); return { role: 'player' }; });
  await h.context.restoreSession(user);
  offline = false;
  await h.context.restoreSession(user);
  assert.equal(h.calls.logout, 0);
  assert.equal(h.calls.checks, 2);
  assert.equal(h.calls.listeners, 1);
  assert.equal(h.calls.views.at(-1), 'app');
});
test('Recordar sesión no permite entrar a un miembro retirado', async () => {
  const h = harness(() => null);
  await h.context.restoreSession(user);
  assert.equal(h.calls.listeners, 0);
  assert.equal(h.calls.views.at(-1), 'denied');
  assert.equal(h.state.member, null);
});
test('Denegación del servidor bloquea los datos, no se interpreta como offline', async () => {
  const h = harness(() => { throw Object.assign(new Error(), { code: 'permission-denied' }); });
  await h.context.restoreSession(user);
  assert.equal(h.calls.views.at(-1), 'denied');
  assert.equal(h.calls.listeners, 0);
});
test('Una comprobación tardía no recupera una sesión cerrada voluntariamente', async () => {
  let finish;
  const h = harness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = h.context.restoreSession(user);
  await h.context.restoreSession(null);
  finish({ role: 'admin' }); await pending;
  assert.equal(h.calls.views.at(-1), 'login');
  assert.equal(h.calls.listeners, 0);
  assert.equal(h.state.user, null);
});
test('Almacén local persistente, alternativa IndexedDB y aviso si ambos fallan', async () => {
  for (const failures of [0, 1, 2]) {
    let attempts = 0;
    const warning = { hidden: true };
    const context = { auth: {}, browserLocalPersistence: 'local', indexedDBLocalPersistence: 'idb',
      setPersistence: async (_, persistence) => { assert.equal(persistence, attempts === 0 ? 'local' : 'idb'); if (++attempts <= failures) throw new Error('storage unavailable'); },
      $: () => warning, safeAuthCode: () => 'unavailable', console: { warn() {} } };
    vm.createContext(context); vm.runInContext(persistenceCode, context);
    assert.equal(await context.configureSessionPersistence(), failures < 2);
    assert.equal(attempts, failures === 0 ? 1 : 2);
    assert.equal(warning.hidden, failures < 2);
  }
});
test('El único cierre explícito de Auth está en los botones de salir', () => {
  const calls = source.split('\n').filter((line) => /signOut\(auth\)/.test(line));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((line) => line.includes('signout')));
  assert.match(source, /getDocFromServer\(doc\(db, "members", email\)\)/);
});
