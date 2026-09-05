import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { filterItems, isMaster, itemFingerprint, validateItem } from '../inventory-utils.js';
import { CATALOG, catalogNotes, catalogEntryForItem } from '../catalog.js';

const item = { name: 'Bláster', quantity: 2, notes: 'Daño energético', status: 'equipado', updatedAt: { seconds: 1, nanoseconds: 0 } };
test('Búsqueda por palabras, notas, acentos y personaje sin mutar datos', () => {
  const items = [item, { ...item, name: 'Medpac', status: 'guardado', characterName: 'Dyc' }];
  assert.equal(filterItems(items, 'blaster energetico').length, 1);
  assert.equal(filterItems(items, 'dyc')[0].name, 'Medpac');
  assert.equal(filterItems(items, '', 'guardado')[0].name, 'Medpac');
  assert.equal(items[0], item);
  assert.equal(filterItems(items, 'inexistente').length, 0);
});
test('Cantidad entera y límites de esquema existentes', () => {
  validateItem(item);
  for (const quantity of [-1, 0, 1.5, 1000000, NaN, Infinity]) assert.throws(() => validateItem({ ...item, quantity }));
  assert.throws(() => validateItem({ ...item, name: '' }));
  assert.throws(() => validateItem({ ...item, notes: 'x'.repeat(401) }));
  assert.throws(() => validateItem({ ...item, status: 'privado' }));
});
test('91 entradas del manual: identificadores únicos y notas guardables sin truncar', () => {
  assert.equal(CATALOG.length, 91);
  assert.equal(new Set(CATALOG.map((i) => i.id)).size, CATALOG.length);
  for (const entry of CATALOG) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(entry.description.length > 10);
    assert.ok(Number.isInteger(entry.price) && entry.price >= 0);
    assert.ok(entry.weight === null || entry.weight >= 0);
    validateItem({ name: entry.name, notes: catalogNotes(entry), quantity: 1, status: 'guardado' });
    assert.equal(catalogEntryForItem(entry), entry);
  }
});
test('Datos cotejados con tablas: decimales, blindaje, lotes y medpac', () => {
  assert.equal(CATALOG.find((i) => i.id === 'fusil-blaster').weight, 4.5);
  assert.equal(CATALOG.find((i) => i.id === 'ballesta-laser').weight, 8);
  assert.equal(CATALOG.find((i) => i.id === 'bacta-1-litro').weight, 2);
  assert.equal(CATALOG.find((i) => i.id === 'medpac').price, 100);
  assert.match(CATALOG.find((i) => i.id === 'medpac').stats, /1d2 heridas/);
  assert.match(CATALOG.find((i) => i.id === 'mono-de-combate').stats, /RD 3 \(heridas\)/);
  assert.equal(CATALOG.filter((i) => i.category === 'Blindaje').length, 11);
  assert.equal(CATALOG.filter((i) => i.category === 'Munición').length, 4);
});
test('Máster como etiqueta de presentación, no administrador implícito', () => {
  assert.equal(isMaster({ name: 'Máster' }), true);
  assert.equal(isMaster({ name: 'Dyc' }), false);
  assert.equal(isMaster({ name: 'Teebo' }), false);
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(source, /state\.isAdmin = member\.role === 'admin'/);
});
test('Identificador de edición detecta cambios de cantidad, notas o instante', () => {
  for (const change of [{ quantity: 3 }, { notes: 'cambiado' }, { updatedAt: { seconds: 1, nanoseconds: 1 } }]) {
    assert.notEqual(itemFingerprint(item), itemFingerprint({ ...item, ...change }));
  }
});

// Exercise the real application mutation functions with an in-memory transaction double.
// No browser, credentials or production requests. This is not a Firestore emulator test.
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}(`);
  return source.slice(start, source.indexOf(`\n${nextName}`, start));
}
function contextFor(current = item) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, textContent: '', close() {} });
    return elements.get(id);
  };
  let data = { ...current }, writes = [], confirms = 0;
  const context = {
    state: { activeCharacterId: 'someone-else', user: { email: 'PLAYER@example.invalid' }, member: {}, authGeneration: 1,
      pendingItems: new Set(), inventories: new Map([['owner', [{ ...item, id: 'object' }]]]), itemDraft: { characterId: 'owner', original: itemFingerprint(item) } },
    $, db: {}, validateItem, itemFingerprint, normalizeEmail: (s) => s.toLowerCase(),
    requireOnline() {}, renderInventory() {}, renderTable() {}, toast() {},
    window: { confirm() { confirms++; return true; } },
    doc: (...args) => args.slice(1).join('/'), collection: (...args) => args.slice(1).join('/'),
    serverTimestamp: () => 'SERVER_TIME',
    runTransaction: async (_, operation) => operation({
      get: async () => ({ exists: () => Boolean(data), data: () => data }),
      update: (ref, payload) => { writes.push({ ref, payload }); data = { ...data, ...payload }; },
      set: (ref, payload) => { writes.push({ ref, payload }); data = payload; },
      delete: (ref) => { writes.push({ ref, deleted: true }); data = null; }
    })
  };
  vm.createContext(context);
  vm.runInContext(functionSource('quickItemAction', 'function handleItemClick'), context);
  vm.runInContext(functionSource('saveItem', 'async function deleteItem'), context);
  vm.runInContext(functionSource('saveCredits', 'async function exportBackup'), context);
  return { context, writes, $, get confirms() { return confirms; }, setData(value) { data = value; } };
}
test('Acciones rápidas incrementan el valor del servidor, no una copia obsoleta', async () => {
  const testContext = contextFor({ ...item, quantity: 7 });
  await testContext.context.quickItemAction('owner', 'object', 'plus');
  assert.equal(testContext.writes[0].payload.quantity, 8);
  assert.equal(testContext.writes[0].ref, 'characters/owner/items/object');
  assert.equal(testContext.writes[0].payload.updatedBy, 'player@example.invalid');
});
test('No elimina una última unidad que no se confirmó por un cambio concurrente', async () => {
  const testContext = contextFor({ ...item, quantity: 1 });
  await assert.rejects(() => testContext.context.quickItemAction('owner', 'object', 'minus'), /cantidad cambió/);
  assert.equal(testContext.writes.length, 0);
  assert.equal(testContext.context.state.pendingItems.size, 0);
});
test('Última unidad visible requiere confirmación; actualización es atómica', async () => {
  const last = { ...item, quantity: 1, id: 'object' }, testContext = contextFor(last);
  testContext.context.state.inventories.set('owner', [last]);
  await testContext.context.quickItemAction('owner', 'object', 'minus');
  assert.equal(testContext.confirms, 1);
  assert.equal(testContext.writes[0].deleted, true);
});
test('Un formulario conserva su destinatario aunque cambie la selección de personaje', async () => {
  const testContext = contextFor();
  for (const [id, value] of Object.entries({ '#item-id': 'object', '#item-name': 'Nuevo nombre', '#item-quantity': '2', '#item-notes': 'Nota', '#item-status': 'equipado' })) testContext.$(id).value = value;
  await testContext.context.saveItem();
  assert.equal(testContext.writes[0].ref, 'characters/owner/items/object');
  assert.equal(testContext.writes[0].payload.name, 'Nuevo nombre');
});
test('Conflicto en edición no escribe encima del otro jugador', async () => {
  const testContext = contextFor({ ...item, quantity: 3 });
  for (const [id, value] of Object.entries({ '#item-id': 'object', '#item-name': 'Nuevo nombre', '#item-quantity': '2', '#item-notes': 'Nota', '#item-status': 'equipado' })) testContext.$(id).value = value;
  await assert.rejects(() => testContext.context.saveItem(), /Otra persona cambió/);
  assert.equal(testContext.writes.length, 0);
  assert.equal(testContext.$('#item-notes').value, 'Nota');
});
test('Saldo concurrente no se sobrescribe', async () => {
  const testContext = contextFor({ credits: 120 });
  testContext.context.state.creditsDraft = { id: 'owner', original: 100 };
  testContext.$('#credits-input').value = '90';
  await assert.rejects(() => testContext.context.saveCredits(), /Otra persona cambió el saldo/);
  assert.equal(testContext.writes.length, 0);
});
test('Añadir del catálogo no deduce créditos ni escribe hasta confirmar', () => {
  const start = source.indexOf('function useCatalogItem('), end = source.indexOf('\nfunction requireOnline', start);
  assert.doesNotMatch(source.slice(start, end), /runTransaction|updateDoc|addDoc|writeBatch/);
});
test('Caché: solo recursos propios; no elimina cachés de otras apps del usuario', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /SHELL_URLS\.has\(url.href\)/);
  assert.match(sw, /key\.startsWith\('amanecer-rebelde-'\)/);
  assert.doesNotMatch(sw, /caches\.match\("\.\/index.html"\)/);
  const context = { self: { registration: { scope: 'https://example.invalid/amanecer-rebelde/' }, addEventListener() {} }, URL, Set };
  vm.createContext(context);
  vm.runInContext(sw, context);
  assert.equal(vm.runInContext('SHELL_URLS.has("https://example.invalid/otra-app/index.html")', context), false);
  assert.equal(vm.runInContext('SHELL_URLS.has("https://example.invalid/amanecer-rebelde/catalog.js")', context), true);
});
test('Todos los módulos y assets están en Pages; sin PDF ni copias de datos públicos', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  for (const file of ['catalog.js', 'inventory-utils.js', 'app.js']) assert.ok(workflow.includes(file));
  assert.doesNotMatch(workflow, /cp .*tmp|\.pdf|inventarios-.*\.json/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(html, /dice-section|dice-form/);
  assert.match(html, /https:\/\/apis.google.com/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
