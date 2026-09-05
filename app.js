import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { filterItems, formatCredits, isMaster, itemFingerprint, validateItem, normalizeText } from "./inventory-utils.js";
import { CATALOG, catalogNotes, catalogEntryForItem } from './catalog.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.useDeviceLanguage();
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const state = {
  user: null,
  member: null,
  members: [],
  characters: [],
  activeCharacterId: null,
  items: [],
  isAdmin: false,
  unsubscribeCharacters: null,
  unsubscribeItems: null,
  unsubscribeMembers: null,
  deferredInstallPrompt: null
};
Object.assign(state, {
  inventoryListeners: new Map(), inventories: new Map(), syncSources: new Map(),
  section: 'inventories', filter: 'all', itemDraft: null, creditsDraft: null,
  pendingItems: new Set(), authGeneration: 0, unsubscribeAccess: null
});

const $ = (selector) => document.querySelector(selector);
const views = {
  login: $("#login-view"),
  denied: $("#denied-view"),
  loading: $("#loading-view"),
  app: $("#app-view")
};

function showOnly(name) {
  Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
}

function normalizeEmail(email = "") { return email.trim().toLowerCase(); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3200);
}

function safeAuthCode(error) {
  const code = typeof error?.code === "string" ? error.code : "auth/unknown";
  return code.startsWith("auth/") ? code.slice(5) : "unknown";
}

function showAuthHelp(error) {
  const code = safeAuthCode(error);
  console.error("Google sign-in failed:", code, error);
  $("#auth-error-code").textContent = code;
  $("#auth-help").hidden = false;
  toast(`No se pudo iniciar sesión (${code}).`);
}

async function resolveAccess(user) {
  const email = normalizeEmail(user.email);
  const memberSnap = await getDoc(doc(db, "members", email));
  return memberSnap.exists() ? memberSnap.data() : null;
}

function renderProfile() {
  const name = state.user.displayName || state.member?.characterName || "Tripulante";
  $("#profile-name").textContent = name;
  $("#profile-email").textContent = state.user.email;
  $("#user-avatar").hidden = !state.user.photoURL;
  $("#user-initial").hidden = Boolean(state.user.photoURL);
  if (state.user.photoURL) $("#user-avatar").src = state.user.photoURL;
  else $("#user-initial").textContent = name.charAt(0).toUpperCase();
  $("#settings-tab").hidden = !state.isAdmin;
}

function startRealtimeListeners() {
  state.unsubscribeCharacters = onSnapshot(query(collection(db, "characters"), orderBy("name", "asc")), { includeMetadataChanges: true }, (snapshot) => {
    state.characters = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    markSync('characters', snapshot);
    for (const [id, unsubscribe] of state.inventoryListeners) {
      if (!state.characters.some((c) => c.id === id)) {
        unsubscribe(); state.inventoryListeners.delete(id); state.inventories.delete(id); state.syncSources.delete(id);
      }
    }
    for (const character of state.characters) {
      if (state.inventoryListeners.has(character.id)) continue;
      state.syncSources.set(character.id, 'loading');
      const unsubscribe = onSnapshot(collection(db, 'characters', character.id, 'items'), { includeMetadataChanges: true }, (itemsSnapshot) => {
        state.inventories.set(character.id, itemsSnapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })));
        markSync(character.id, itemsSnapshot);
        renderInventory(); renderTable(); renderCharacterPanel(); renderCharacterTabs();
      }, handleDataError);
      state.inventoryListeners.set(character.id, unsubscribe);
    }
    if (!state.activeCharacterId || !state.characters.some((character) => character.id === state.activeCharacterId)) {
      state.activeCharacterId = state.characters.find((c) => c.id === state.member?.characterId)?.id || state.characters[0]?.id || null;
    }
    renderCharacterTabs();
    renderCharacterPanel();
    renderInventory(); renderTable(); renderCatalogCharacters();
  }, handleDataError);

  if (state.isAdmin) {
    state.unsubscribeMembers = onSnapshot(query(collection(db, "members"), orderBy("characterName", "asc")), (snapshot) => {
      state.members = snapshot.docs.map((entry) => ({ email: entry.id, ...entry.data() }));
      renderMembers();
    }, handleDataError);
  }
  state.unsubscribeAccess = onSnapshot(doc(db, 'members', normalizeEmail(state.user.email)), (snapshot) => {
    if (!snapshot.exists()) { revokeAccess(); return; }
    if (snapshot.data().role !== state.member?.role) { signOut(auth).catch(handleDataError); }
  }, handleDataError);
}

function handleDataError(error) {
  console.error('Data operation failed:', error.code || error.message);
  if (error.code === 'permission-denied' || error.code === 'unauthenticated') { revokeAccess(); return; }
  state.syncSources.set('error', 'error'); renderSync();
  toast('No se pudieron sincronizar los datos. Recargá para reintentar.');
}

function renderCharacterTabs() {
  $("#character-tabs").innerHTML = state.characters.map((character) => `
    <button class="character-chip ${character.id === state.activeCharacterId ? "is-active" : ""} ${isMaster(character) ? 'is-master' : ''}" type="button" aria-pressed="${character.id === state.activeCharacterId}" data-character-id="${escapeHtml(character.id)}">
      <strong>${escapeHtml(character.name)}</strong>
      <span>${isMaster(character) ? 'Máster' : character.id === state.member?.characterId ? 'Tu PJ' : 'PJ'}</span>
    </button>
  `).join("");
}

function markSync(key, snapshot) {
  state.syncSources.set(key, snapshot.metadata.hasPendingWrites ? 'pending' : snapshot.metadata.fromCache ? 'cache' : 'ok');
  renderSync();
}
function renderSync() {
  const values = [...state.syncSources.values()];
  const label = !navigator.onLine ? 'Sin conexión · solo lectura' : values.includes('error') ? 'Error de sincronización' : values.some((v) => v !== 'ok') || !values.length ? 'Sincronizando…' : 'Sincronizado';
  $('#sync-status').textContent = label;
  $('#sync-status').classList.toggle('sync-warning', label !== 'Sincronizado');
}
function stopListeners() {
  state.unsubscribeCharacters?.(); state.unsubscribeItems?.(); state.unsubscribeMembers?.(); state.unsubscribeAccess?.();
  state.inventoryListeners.forEach((unsubscribe) => unsubscribe()); state.inventoryListeners.clear();
}
function clearPrivateView() {
  stopListeners();
  state.inventories.clear(); state.syncSources.clear(); state.characters = []; state.items = []; state.members = [];
  state.itemDraft = null; state.creditsDraft = null; state.activeCharacterId = null;
  state.isAdmin = false; state.pendingItems.clear(); state.member = null;
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  $('#item-form').reset(); $('#credits-form').reset(); $('#member-form').reset();
  ['#character-tabs', '#character-panel', '#items-list', '#table-summary', '#table-characters', '#table-items', '#members-list', '#profile-name', '#profile-email', '#catalog-character', '#catalog-list', '#item-reference-body'].forEach((selector) => { $(selector).textContent = ''; });
  $('#item-search').value = ''; $('#table-search').value = ''; $('#profile-menu').hidden = true;
  $('#user-avatar').removeAttribute('src'); $('#item-owner').textContent = ''; $('#credits-character').textContent = '';
  $('#item-error').hidden = true; $('#credits-error').hidden = true; $('#toast').hidden = true;
}
function revokeAccess() {
  state.authGeneration++;
  clearPrivateView();
  $('#denied-email').textContent = 'No se pudo autorizar el acceso a los datos. Volvé a iniciar sesión o consultá con un administrador.';
  showOnly('denied');
}
function currentItems() { return state.inventories.get(state.activeCharacterId) || []; }
function selectCharacter(id) {
  if (!state.characters.some((character) => character.id === id)) return;
  state.activeCharacterId = id;
  state.filter = 'all'; $('#item-search').value = '';
  renderCharacterTabs(); renderCharacterPanel(); renderInventory();
  switchSection('inventories');
}
function itemMarkup(item, characterId, owner = '') {
  const key = `${characterId}/${item.id}`, busy = state.pendingItems.has(key) ? 'disabled' : '';
  return `<div class="item-row" data-row-item="${escapeHtml(item.id)}" data-row-character="${escapeHtml(characterId)}">
    <button class="item-open" type="button" data-action="edit" aria-label="Editar ${escapeHtml(item.name)}${owner ? ' de ' + escapeHtml(owner) : ''}"><span class="item-copy"><strong>${escapeHtml(item.name)}</strong><span class="item-detail">${owner ? `<b>${escapeHtml(owner)}</b> · ` : ''}${escapeHtml(item.notes || 'Sin notas')}</span></span></button>
    <button class="item-status ${item.status === 'equipado' ? 'equipado' : ''}" type="button" data-action="equip" aria-label="${item.status === 'equipado' ? 'Guardar' : 'Equipar'} ${escapeHtml(item.name)}" aria-pressed="${item.status === 'equipado'}" ${busy}>${item.status === 'equipado' ? 'Equipado' : 'Guardado'}</button>
    <div class="quantity-control"><button type="button" data-action="minus" aria-label="Quitar una unidad de ${escapeHtml(item.name)}" ${busy}>−</button><span aria-label="Cantidad ${item.quantity}">${item.quantity}</span><button type="button" data-action="plus" aria-label="Añadir una unidad de ${escapeHtml(item.name)}" ${busy}>+</button></div>
  </div>`;
}
function renderInventory() {
  state.items = currentItems();
  const visible = filterItems(state.items, $('#item-search').value, state.filter, $('#item-sort').value);
  $('#add-item-button').disabled = !state.activeCharacterId;
  $('#items-count').textContent = String(state.items.length);
  $('#items-summary').textContent = `${visible.length} / ${state.items.length}`;
  $('#item-filters').querySelectorAll('[data-filter]').forEach((button) => { button.classList.toggle('is-active', button.dataset.filter === state.filter); button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter)); });
  $('#items-list').innerHTML = !state.activeCharacterId ? '<p class="empty-state">Seleccioná un personaje.</p>' : !state.inventories.has(state.activeCharacterId) ? '<p class="empty-state">Cargando equipo…</p>' : visible.length ? visible.map((item) => itemMarkup(item, state.activeCharacterId)).join('') : `<div class="empty-state"><strong>${state.items.length ? 'No hay coincidencias' : 'Equipo por preparar'}</strong>${state.items.length ? 'Probá otro nombre o filtro.' : 'Añadí el primer objeto para tenerlo a mano en la sesión.'}</div>`;
}
function renderTable() {
  if (state.section !== 'table') return;
  const players = state.characters.filter((c) => !isMaster(c));
  const ready = state.characters.every((c) => state.inventories.has(c.id));
  const all = state.characters.flatMap((c) => (state.inventories.get(c.id) || []).map((item) => ({ ...item, characterId: c.id, characterName: c.name })));
  $('#table-summary').innerHTML = `<div><span>Personajes jugadores</span><strong>${players.length}</strong></div><div><span>Créditos de los PJ</span><strong>${formatCredits(players.reduce((sum, c) => sum + (Number(c.credits) || 0), 0))} <small>₡</small></strong></div><div><span>Objetos de la mesa</span><strong>${ready ? all.length : '…'}</strong></div>`;
  $('#table-characters').innerHTML = state.characters.map((c) => {
    const inventory = state.inventories.get(c.id);
    return `<button type="button" class="panel crew-card ${isMaster(c) ? 'is-master' : ''}" data-character-id="${escapeHtml(c.id)}"><span class="eyebrow">${isMaster(c) ? 'Dirección de juego' : 'Personaje jugador'}</span><strong>${escapeHtml(c.name)}</strong><span class="crew-credits">${formatCredits(c.credits)} ₡</span><span class="muted">${inventory ? `${inventory.length} objetos · ${inventory.filter((i) => i.status === 'equipado').length} equipados` : 'Cargando…'}</span><span class="crew-open">Abrir inventario ↗</span></button>`;
  }).join('');
  const matches = filterItems(all, $('#table-search').value, 'all', 'name');
  $('#table-items').innerHTML = matches.length ? matches.map((item) => itemMarkup(item, item.characterId, item.characterName)).join('') : `<p class="empty-state">${ready ? 'No hay objetos que mostrar.' : 'Cargando inventarios…'}</p>`;
}

function renderCharacterPanel() {
  const character = state.characters.find((entry) => entry.id === state.activeCharacterId);
  if (!character) {
    $("#character-panel").innerHTML = `<div class="panel empty-state"><strong>No hay personajes</strong>Agregá el primero desde Configuración.</div>`;
    return;
  }
  $("#character-panel").innerHTML = `
    <article class="panel character-hero">
      <div class="character-heading">
        <p class="eyebrow">${isMaster(character) ? 'Material del máster · compartido' : 'Equipo personal'}</p>
        <h3>${escapeHtml(character.name)}</h3>
      </div>
      <button type="button" id="edit-credits" class="credits-box" aria-label="Editar saldo de ${escapeHtml(character.name)}"><span>Créditos <span aria-hidden="true">↗</span></span><strong>${formatCredits(character.credits)} <small>₡</small></strong></button>
    </article>
  `;
}

function renderMembers() {
  $("#members-list").innerHTML = state.members.map((member) => `
    <div class="member-row">
      <div class="member-info">
        <strong>${escapeHtml(member.characterName)}</strong>
        <span>${escapeHtml(member.email)}</span>
        ${member.role === "admin" ? `<span class="role-badge">Administrador</span>` : ""}
      </div>
      ${member.role === 'admin' ? "" : `<button class="remove-button" type="button" data-remove-email="${escapeHtml(member.email)}" data-character-id="${escapeHtml(member.characterId)}">Quitar acceso</button>`}
    </div>
  `).join("");
}

function openItemDialog(item = null, characterId = state.activeCharacterId) {
  if (!characterId) return;
  state.itemDraft = { characterId, original: item ? itemFingerprint(item) : null };
  $('#item-owner').textContent = state.characters.find((c) => c.id === characterId)?.name || 'Inventario';
  showItemReference(item);
  $('#item-error').hidden = true;
  $("#item-dialog-title").textContent = item ? "Editar objeto" : "Nuevo objeto";
  $("#item-id").value = item?.id || "";
  $("#item-name").value = item?.name || "";
  $("#item-quantity").value = item?.quantity || 1;
  $("#item-notes").value = item?.notes || "";
  $("#item-status").value = item?.status || "guardado";
  $('#notes-counter').textContent = `${$('#item-notes').value.length} / 400`;
  $("#delete-item").hidden = !item;
  $("#item-dialog").showModal();
  setTimeout(() => $("#item-name").focus(), 0);
}

async function saveItem() {
  requireOnline();
  const draft = state.itemDraft;
  if (!draft) return;
  const characterId = draft.characterId;
  const itemId = $("#item-id").value;
  const payload = {
    name: $("#item-name").value.trim(),
    quantity: Number($("#item-quantity").value),
    notes: $("#item-notes").value.trim(),
    status: $("#item-status").value === "equipado" ? "equipado" : "guardado",
    updatedAt: serverTimestamp(),
    updatedBy: normalizeEmail(state.user.email)
  };
  validateItem(payload);
  const itemRef = itemId ? doc(db, 'characters', characterId, 'items', itemId) : doc(collection(db, 'characters', characterId, 'items'));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (itemId) {
      if (!snapshot.exists() || itemFingerprint(snapshot.data()) !== draft.original) throw new Error('Otra persona cambió este objeto. Tus notas siguen aquí: copialas si las necesitás y volvé a abrir el objeto para revisar el cambio.');
      transaction.update(itemRef, payload);
    } else {
      if (snapshot.exists()) throw new Error('El objeto ya existe.');
      transaction.set(itemRef, { ...payload, createdAt: serverTimestamp() });
    }
  });
  $("#item-dialog").close();
  toast(itemId ? "Objeto actualizado." : "Objeto agregado.");
}

async function deleteItem() {
  requireOnline();
  const itemId = $("#item-id").value;
  const draft = state.itemDraft;
  if (!itemId || !window.confirm("¿Eliminar este objeto del inventario?")) return;
  const ref = doc(db, 'characters', draft.characterId, 'items', itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || itemFingerprint(snapshot.data()) !== draft.original) throw new Error('El objeto cambió. Cerrá y volvé a abrirlo antes de eliminarlo.');
    transaction.delete(ref);
  });
  $("#item-dialog").close();
  toast("Objeto eliminado.");
}

async function addMember(event) {
  event.preventDefault();
  requireOnline();
  const email = normalizeEmail($("#member-email").value);
  const characterName = $("#member-character").value.trim();
  if (!email || !characterName) return;
  if (email.length > 254 || email.includes("/") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast("Ingresá un correo de Google válido.");
    return;
  }
  const memberRef = doc(db, "members", email);
  if ((await getDoc(memberRef)).exists()) {
    toast("Ese correo ya está autorizado.");
    return;
  }
  const safeBase = characterName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "personaje";
  const characterId = `${safeBase}-${crypto.randomUUID().slice(0, 6)}`;
  const batch = writeBatch(db);
  batch.set(memberRef, { email, characterId, characterName, role: "player", createdAt: serverTimestamp() });
  batch.set(doc(db, "characters", characterId), { name: characterName, credits: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  event.target.reset();
  toast(`${characterName} ya puede acceder.`);
}

async function removeMember(button) {
  requireOnline();
  const email = button.dataset.removeEmail;
  if (!window.confirm(`¿Quitar el acceso de ${email}? Su inventario se conservará.`)) return;
  await deleteDoc(doc(db, "members", email));
  toast("Acceso retirado. El inventario se conservó.");
}

function switchSection(view) {
  if (!['inventories', 'table', 'catalog', 'settings'].includes(view)) return;
  if (view === "settings" && !state.isAdmin) return;
  state.section = view;
  $("#inventories-section").hidden = view !== "inventories";
  $("#table-section").hidden = view !== "table";
  $('#catalog-section').hidden = view !== 'catalog';
  $("#settings-section").hidden = view !== "settings";
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("is-active", tab.dataset.view === view); tab.setAttribute('aria-current', tab.dataset.view === view ? 'page' : 'false'); });
  renderTable();
  if (view === 'catalog') { renderCatalogCharacters(); renderCatalog(); }
}

function renderCatalogCharacters() {
  const previous = $('#catalog-character').value;
  $('#catalog-character').innerHTML = state.characters.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${isMaster(c) ? ' · Máster' : ''}</option>`).join('');
  $('#catalog-character').value = state.characters.some((c) => c.id === previous) ? previous : state.activeCharacterId || '';
  $('#catalog-custom').disabled = !state.characters.length;
}
function renderCatalog() {
  const words = normalizeText($('#catalog-search').value).split(/\s+/).filter(Boolean);
  const category = $('#catalog-category').value;
  const records = CATALOG.filter((item) => (category === 'all' || item.category === category) && words.every((word) => normalizeText(`${item.name} ${item.category} ${item.description} ${item.stats}`).includes(word)));
  $('#catalog-count').textContent = `${records.length} de ${CATALOG.length} objetos`;
  $('#catalog-list').innerHTML = records.length ? records.map((item) => `<button class="panel catalog-card" type="button" data-catalog-id="${item.id}"><span class="catalog-card-heading"><span class="eyebrow">${escapeHtml(item.category)}</span><span class="catalog-price">${formatCredits(item.price)} ₡</span></span><strong>${escapeHtml(item.name)}</strong><span class="catalog-description">${escapeHtml(item.description)}</span><span class="catalog-meta">${item.weight === null ? 'Peso no indicado' : `${item.weight.toLocaleString('es-ES')} kg`} · p. ${item.page}<span>Abrir +</span></span></button>`).join('') : '<div class="empty-state"><strong>No hay coincidencias</strong>Probá otro nombre o añadí un objeto propio.</div>';
}
function showItemReference(item) {
  const reference = catalogEntryForItem(item);
  $('#item-reference').hidden = !reference;
  $('#item-reference').open = false;
  $('#item-reference-body').innerHTML = reference ? `<p>${escapeHtml(reference.description)}</p><p>${escapeHtml(reference.stats)}</p><p class="muted">${formatCredits(reference.price)} ₡ · ${reference.weight === null ? 'Peso no indicado' : `${reference.weight} kg`} · Manual Básico Revisado, p. ${reference.page}.</p><p class="surface-note">Referencia por nombre; tus notas y los cambios del máster prevalecen. No calcula efectos ni descuenta créditos.</p>` : '';
}
function useCatalogItem(id) {
  const item = CATALOG.find((entry) => entry.id === id), characterId = $('#catalog-character').value;
  if (!item) return;
  if (!state.characters.some((c) => c.id === characterId)) { toast('Elegí un personaje para añadir el objeto.'); return; }
  openItemDialog(null, characterId);
  $('#item-name').value = item.name;
  $('#item-notes').value = catalogNotes(item);
  $('#notes-counter').textContent = `${$('#item-notes').value.length} / 400`;
  showItemReference(item);
  $('#item-dialog-title').textContent = 'Añadir del catálogo';
}

function requireOnline() {
  if (!state.member || !state.user) throw new Error('Volvé a iniciar sesión para editar.');
  if (!navigator.onLine) throw new Error('Necesitás conexión para guardar. Tus cambios siguen en el formulario.');
}
function userError(error) {
  if (!error.code) return error.message || 'No se pudo completar la operación.';
  if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
    revokeAccess(); return 'No tenés acceso. Volvé a iniciar sesión.';
  }
  return 'No se pudo guardar. Comprobá la conexión y volvé a intentar; el formulario se conserva.';
}
async function busyForm(form, errorSelector, operation) {
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const generation = state.authGeneration;
  const controls = [...form.querySelectorAll('button, input, textarea, select')].map((element) => ({ element, disabled: element.disabled }));
  controls.forEach(({ element }) => { element.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  if (errorSelector) $(errorSelector).hidden = true;
  try { await operation(); }
  catch (error) {
    if (generation !== state.authGeneration) return;
    const message = userError(error);
    if (errorSelector) { $(errorSelector).textContent = message; $(errorSelector).hidden = false; }
    else toast(message);
  } finally {
    delete form.dataset.busy; form.removeAttribute('aria-busy');
    controls.forEach(({ element, disabled }) => { element.disabled = disabled; });
  }
}
async function quickItemAction(characterId, itemId, action) {
  requireOnline();
  const key = `${characterId}/${itemId}`;
  if (state.pendingItems.has(key)) return;
  const shown = state.inventories.get(characterId)?.find((item) => item.id === itemId);
  if (!shown) return;
  const deleteLast = action === 'minus' && shown.quantity === 1;
  if (deleteLast && !window.confirm(`¿Quitar la última unidad de ${shown.name}? Se eliminará el objeto.`)) return;
  state.pendingItems.add(key); renderInventory(); renderTable();
  const generation = state.authGeneration;
  const ref = doc(db, 'characters', characterId, 'items', itemId);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Este objeto ya se eliminó.');
      const item = snapshot.data();
      const stamp = { updatedAt: serverTimestamp(), updatedBy: normalizeEmail(state.user.email) };
      if (action === 'equip') {
        transaction.update(ref, { ...stamp, status: shown.status === 'equipado' ? 'guardado' : 'equipado' });
      } else {
        const quantity = item.quantity + (action === 'plus' ? 1 : -1);
        if (quantity > 999999) throw new Error('La cantidad máxima es 999999.');
        if (quantity < 1) {
          if (!deleteLast || itemFingerprint(item) !== itemFingerprint(shown)) throw new Error('La cantidad cambió. Revisá el objeto antes de quitar la última unidad.');
          transaction.delete(ref);
        } else transaction.update(ref, { ...stamp, quantity });
      }
    });
    if (generation === state.authGeneration) toast(action === 'equip' ? 'Estado guardado.' : 'Cantidad guardada.');
  } finally {
    state.pendingItems.delete(key);
    if (generation === state.authGeneration) { renderInventory(); renderTable(); }
  }
}
function handleItemClick(event) {
  const button = event.target.closest('[data-action]'), row = button?.closest('[data-row-item]');
  if (!row) return;
  const { rowItem: itemId, rowCharacter: characterId } = row.dataset;
  if (button.dataset.action === 'edit') {
    const item = state.inventories.get(characterId)?.find((entry) => entry.id === itemId);
    if (item) openItemDialog(item, characterId);
  } else quickItemAction(characterId, itemId, button.dataset.action).catch((error) => toast(userError(error)));
}
function openCreditsDialog() {
  const character = state.characters.find((c) => c.id === state.activeCharacterId);
  if (!character) return;
  state.creditsDraft = { id: character.id, original: character.credits };
  $('#credits-character').textContent = character.name;
  $('#credits-input').value = String(character.credits);
  $('#credits-error').hidden = true;
  $('#credits-dialog').showModal();
}
async function saveCredits() {
  requireOnline();
  const draft = state.creditsDraft, credits = Number($('#credits-input').value);
  if (!draft) return;
  if (!Number.isInteger(credits) || credits < 0 || credits > 1000000000) throw new Error('Usá un saldo entero entre 0 y 1000000000.');
  const ref = doc(db, 'characters', draft.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('El personaje ya no está disponible.');
    if (snapshot.data().credits !== draft.original) throw new Error('Otra persona cambió el saldo. Cerrá y volvé a abrirlo para revisar el saldo actual.');
    transaction.update(ref, { credits, updatedAt: serverTimestamp(), updatedBy: normalizeEmail(state.user.email) });
  });
  $('#credits-dialog').close(); toast('Saldo guardado.');
}
async function exportBackup() {
  requireOnline();
  if (!window.confirm('La copia incluye los inventarios y los correos de autoría de sus cambios. Guardala en un lugar privado. Evitad editar mientras se descarga. ¿Continuar?')) return;
  const button = $('#export-backup'), generation = state.authGeneration;
  button.disabled = true;
  try {
    const startedAt = new Date().toISOString();
    const characters = await getDocsFromServer(collection(db, 'characters'));
    const records = await Promise.all(characters.docs.map(async (character) => {
      const items = await getDocsFromServer(collection(db, 'characters', character.id, 'items'));
      return { id: character.id, data: character.data(), items: items.docs.map((item) => ({ id: item.id, data: item.data() })) };
    }));
    if (generation !== state.authGeneration || !state.member) return;
    const copy = { format: 'amanecer-rebelde-inventory', version: 1, project: firebaseConfig.projectId, startedAt, completedAt: new Date().toISOString(), note: 'Exportación de inventarios. No incluye cuentas de acceso ni es una instantánea atómica entre colecciones.', characters: records };
    const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `amanecer-rebelde-inventarios-${startedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Copia preparada para descargar.');
  } finally { button.disabled = false; }
}

async function login() {
  const button = $("#login-button");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  $("#auth-help").hidden = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") return;

    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        showAuthHelp(redirectError);
        return;
      }
    }

    showAuthHelp(error);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

$("#login-button").addEventListener("click", login);
$("#denied-signout").addEventListener("click", () => signOut(auth));
$("#signout-button").addEventListener("click", () => signOut(auth));
$("#profile-button").addEventListener("click", () => { $("#profile-menu").hidden = !$("#profile-menu").hidden; });
$("#close-dialog").addEventListener("click", () => $("#item-dialog").close());
$("#cancel-item").addEventListener("click", () => $("#item-dialog").close());
$("#delete-item").addEventListener("click", () => busyForm($('#item-form'), '#item-error', deleteItem));
$("#item-form").addEventListener("submit", (event) => { event.preventDefault(); busyForm(event.target, '#item-error', saveItem); });
$("#member-form").addEventListener("submit", (event) => { event.preventDefault(); busyForm(event.target, null, () => addMember(event)); });
$('#credits-form').addEventListener('submit', (event) => { event.preventDefault(); busyForm(event.target, '#credits-error', saveCredits); });
$('#item-notes').addEventListener('input', () => { $('#notes-counter').textContent = `${$('#item-notes').value.length} / 400`; });
$('#item-search').addEventListener('input', renderInventory);
$('#item-sort').addEventListener('change', renderInventory);
$('#table-search').addEventListener('input', renderTable);
$('#catalog-search').addEventListener('input', renderCatalog);
$('#catalog-category').addEventListener('change', renderCatalog);
$('#catalog-custom').addEventListener('click', () => openItemDialog(null, $('#catalog-character').value));
$('#catalog-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-catalog-id]');
  if (button) useCatalogItem(button.dataset.catalogId);
});
$('#item-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (button) { state.filter = button.dataset.filter; renderInventory(); }
});
$('#items-list').addEventListener('click', handleItemClick);
$('#table-items').addEventListener('click', handleItemClick);
$('#add-item-button').addEventListener('click', () => openItemDialog());
$('#export-backup').addEventListener('click', () => exportBackup().catch((error) => toast(userError(error))));
$('#table-characters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-character-id]');
  if (button) selectCharacter(button.dataset.characterId);
});
document.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close]');
  if (close) document.getElementById(close.dataset.close)?.close();
  if (!event.target.closest('#profile-menu, #profile-button')) $('#profile-menu').hidden = true;
});
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => {
  if (dialog.querySelector('form')?.dataset.busy) event.preventDefault();
}));

$("#character-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-character-id]");
  if (!button || button.dataset.characterId === state.activeCharacterId) return;
  selectCharacter(button.dataset.characterId);
});

$("#character-panel").addEventListener("click", (event) => {
  if (event.target.closest('#edit-credits')) openCreditsDialog();
});

$("#members-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-email]");
  if (button) removeMember(button).catch((error) => toast(userError(error)));
});

$(".tabbar").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-view]");
  if (tab) switchSection(tab.dataset.view);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  $("#install-button").hidden = false;
});

$("#install-button").addEventListener("click", async () => {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $("#install-button").hidden = true;
  } else {
    toast("Usá «Añadir a pantalla de inicio» desde el menú del navegador.");
  }
});

window.addEventListener("appinstalled", () => { $("#install-button").hidden = true; toast("Aplicación instalada."); });
window.addEventListener('online', renderSync);
window.addEventListener('offline', renderSync);

try {
  await setPersistence(auth, browserLocalPersistence);
} catch (error) {
  console.warn("No se pudo activar la sesión persistente:", safeAuthCode(error));
}

try {
  await getRedirectResult(auth);
} catch (error) {
  showAuthHelp(error);
}

onAuthStateChanged(auth, async (user) => {
  const generation = ++state.authGeneration;
  clearPrivateView(); state.user = user;
  if (!user) {
    state.user = null;
    showOnly("login");
    return;
  }
  showOnly("loading");
  try {
    const member = await resolveAccess(user);
    if (generation !== state.authGeneration) return;
    if (!member) {
      $("#denied-email").textContent = `${user.email} no está en la lista de la tripulación.`;
      showOnly("denied");
      return;
    }
    state.member = member; state.isAdmin = member.role === 'admin';
    renderProfile();
    state.filter = 'all';
    switchSection(isMaster({ name: member.characterName }) ? 'table' : 'inventories');
    startRealtimeListeners();
    showOnly("app");
  } catch (error) {
    if (generation !== state.authGeneration) return;
    console.error(error);
    toast("No se pudo verificar el acceso.");
    await signOut(auth);
  }
});

if ("serviceWorker" in navigator) {
  let workerRegistration;
  const announceUpdate = () => { if (workerRegistration?.waiting) $('#update-banner').hidden = false; };
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    workerRegistration = registration; announceUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate(); });
    });
  }).catch(console.error);
  $('#apply-update').addEventListener('click', () => {
    if (document.querySelector('dialog[open]') || document.querySelector('form[data-busy]') || state.pendingItems.size) { toast('Guardá o cerrá el formulario antes de actualizar.'); return; }
    if (workerRegistration?.waiting) workerRegistration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    else window.location.reload();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    $('#update-banner').hidden = false;
    if (!document.querySelector('dialog[open]') && !state.pendingItems.size) window.location.reload();
  });
}
