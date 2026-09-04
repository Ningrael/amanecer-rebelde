import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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

async function resolveAccess(user) {
  state.user = user;
  const email = normalizeEmail(user.email);
  const memberSnap = await getDoc(doc(db, "members", email));
  if (!memberSnap.exists()) return false;
  state.member = memberSnap.data();
  state.isAdmin = state.member?.role === "admin";
  return true;
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
  state.unsubscribeCharacters?.();
  state.unsubscribeMembers?.();
  state.unsubscribeCharacters = onSnapshot(query(collection(db, "characters"), orderBy("name", "asc")), (snapshot) => {
    state.characters = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    if (!state.activeCharacterId || !state.characters.some((character) => character.id === state.activeCharacterId)) {
      state.activeCharacterId = state.member?.characterId || state.characters[0]?.id || null;
      subscribeToItems();
    }
    renderCharacterTabs();
    renderCharacterPanel();
  }, handleDataError);

  if (state.isAdmin) {
    state.unsubscribeMembers = onSnapshot(query(collection(db, "members"), orderBy("characterName", "asc")), (snapshot) => {
      state.members = snapshot.docs.map((entry) => ({ email: entry.id, ...entry.data() }));
      renderMembers();
    }, handleDataError);
  }
}

function handleDataError(error) {
  console.error(error);
  toast("No se pudieron sincronizar los datos.");
  $("#sync-status").textContent = "Sin conexión";
  $("#sync-status").style.color = "var(--danger)";
}

function renderCharacterTabs() {
  $("#character-tabs").innerHTML = state.characters.map((character) => `
    <button class="character-chip ${character.id === state.activeCharacterId ? "is-active" : ""}" type="button" role="tab" aria-selected="${character.id === state.activeCharacterId}" data-character-id="${escapeHtml(character.id)}">
      <strong>${escapeHtml(character.name)}</strong>
      <span>${character.id === state.member?.characterId ? "Tu personaje" : "Tripulante"}</span>
    </button>
  `).join("");
}

function subscribeToItems() {
  state.unsubscribeItems?.();
  state.items = [];
  if (!state.activeCharacterId) return;
  const itemsQuery = query(collection(db, "characters", state.activeCharacterId, "items"), orderBy("createdAt", "asc"));
  state.unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
    state.items = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    renderCharacterPanel();
  }, handleDataError);
}

function renderCharacterPanel() {
  const character = state.characters.find((entry) => entry.id === state.activeCharacterId);
  if (!character) {
    $("#character-panel").innerHTML = `<div class="panel empty-state"><strong>No hay personajes</strong>Agregá el primero desde Configuración.</div>`;
    return;
  }
  const itemsMarkup = state.items.length ? state.items.map((item) => `
    <button class="item-row" type="button" data-item-id="${escapeHtml(item.id)}">
      <span class="item-copy">
        <strong>${escapeHtml(item.name)}</strong>
        ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
      </span>
      <span class="item-status ${item.status === "equipado" ? "equipado" : ""}">${item.status === "equipado" ? "Equipado" : "Guardado"}</span>
      <span class="item-quantity" aria-label="Cantidad ${Number(item.quantity) || 1}">${Number(item.quantity) || 1}</span>
    </button>
  `).join("") : `<div class="empty-state"><strong>Inventario vacío</strong>Agregá el primer objeto de ${escapeHtml(character.name)}.</div>`;

  $("#character-panel").innerHTML = `
    <article class="panel character-hero">
      <div>
        <p class="eyebrow">Ficha de personaje</p>
        <h3>${escapeHtml(character.name)}</h3>
        <p>Inventario compartido de la tripulación</p>
      </div>
      <div class="credits-box">
        <label for="credits-input">Créditos</label>
        <div class="credits-row">
          <input id="credits-input" type="number" min="0" max="1000000000" step="1" value="${Number(character.credits) || 0}" inputmode="numeric" aria-label="Créditos de ${escapeHtml(character.name)}" />
          <span class="credit-symbol">₡</span>
        </div>
      </div>
    </article>
    <article class="panel inventory-panel">
      <div class="panel-heading">
        <div>
          <h3>Objetos</h3>
          <p>${state.items.length} ${state.items.length === 1 ? "registro" : "registros"}</p>
        </div>
        <button id="add-item-button" class="button button-primary add-button" type="button">+ Objeto</button>
      </div>
      <div class="items-list">${itemsMarkup}</div>
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
      ${member.email === normalizeEmail(state.user?.email) ? "" : `<button class="remove-button" type="button" data-remove-email="${escapeHtml(member.email)}" data-character-id="${escapeHtml(member.characterId)}">Quitar acceso</button>`}
    </div>
  `).join("");
}

function openItemDialog(item = null) {
  $("#item-dialog-title").textContent = item ? "Editar objeto" : "Nuevo objeto";
  $("#item-id").value = item?.id || "";
  $("#item-name").value = item?.name || "";
  $("#item-quantity").value = item?.quantity || 1;
  $("#item-notes").value = item?.notes || "";
  $("#item-status").value = item?.status || "guardado";
  $("#delete-item").hidden = !item;
  $("#item-dialog").showModal();
  setTimeout(() => $("#item-name").focus(), 0);
}

async function saveItem() {
  const characterId = state.activeCharacterId;
  const itemId = $("#item-id").value;
  const payload = {
    name: $("#item-name").value.trim(),
    quantity: Math.max(1, Number.parseInt($("#item-quantity").value, 10) || 1),
    notes: $("#item-notes").value.trim(),
    status: $("#item-status").value === "equipado" ? "equipado" : "guardado",
    updatedAt: serverTimestamp(),
    updatedBy: normalizeEmail(state.user.email)
  };
  if (!payload.name) return;
  if (itemId) await updateDoc(doc(db, "characters", characterId, "items", itemId), payload);
  else await addDoc(collection(db, "characters", characterId, "items"), { ...payload, createdAt: serverTimestamp() });
  $("#item-dialog").close();
  toast(itemId ? "Objeto actualizado." : "Objeto agregado.");
}

async function deleteItem() {
  const itemId = $("#item-id").value;
  if (!itemId || !window.confirm("¿Eliminar este objeto del inventario?")) return;
  await deleteDoc(doc(db, "characters", state.activeCharacterId, "items", itemId));
  $("#item-dialog").close();
  toast("Objeto eliminado.");
}

async function addMember(event) {
  event.preventDefault();
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
  const email = button.dataset.removeEmail;
  if (!window.confirm(`¿Quitar el acceso de ${email}? Su inventario se conservará.`)) return;
  await deleteDoc(doc(db, "members", email));
  toast("Acceso retirado. El inventario se conservó.");
}

function switchSection(view) {
  if (view === "settings" && !state.isAdmin) return;
  $("#inventories-section").hidden = view !== "inventories";
  $("#settings-section").hidden = view !== "settings";
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
}

async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked") toast("El navegador bloqueó la ventana de Google. Permití ventanas emergentes e intentá otra vez.");
    else if (error.code !== "auth/popup-closed-by-user") toast("No se pudo iniciar sesión con Google.");
  }
}

$("#login-button").addEventListener("click", login);
$("#denied-signout").addEventListener("click", () => signOut(auth));
$("#signout-button").addEventListener("click", () => signOut(auth));
$("#profile-button").addEventListener("click", () => { $("#profile-menu").hidden = !$("#profile-menu").hidden; });
$("#close-dialog").addEventListener("click", () => $("#item-dialog").close());
$("#cancel-item").addEventListener("click", () => $("#item-dialog").close());
$("#delete-item").addEventListener("click", () => deleteItem().catch(handleDataError));
$("#item-form").addEventListener("submit", (event) => { event.preventDefault(); saveItem().catch(handleDataError); });
$("#member-form").addEventListener("submit", (event) => addMember(event).catch(handleDataError));

$("#character-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-character-id]");
  if (!button || button.dataset.characterId === state.activeCharacterId) return;
  state.activeCharacterId = button.dataset.characterId;
  state.items = [];
  renderCharacterTabs();
  renderCharacterPanel();
  subscribeToItems();
});

$("#character-panel").addEventListener("click", (event) => {
  if (event.target.closest("#add-item-button")) return openItemDialog();
  const itemButton = event.target.closest("[data-item-id]");
  if (itemButton) openItemDialog(state.items.find((item) => item.id === itemButton.dataset.itemId));
});

$("#character-panel").addEventListener("change", (event) => {
  if (event.target.id !== "credits-input") return;
  const credits = Math.min(1000000000, Math.max(0, Number.parseInt(event.target.value, 10) || 0));
  event.target.value = String(credits);
  updateDoc(doc(db, "characters", state.activeCharacterId), { credits, updatedAt: serverTimestamp(), updatedBy: normalizeEmail(state.user.email) })
    .then(() => toast("Créditos actualizados."))
    .catch(handleDataError);
});

$("#members-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-email]");
  if (button) removeMember(button).catch(handleDataError);
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
window.addEventListener("online", () => { $("#sync-status").textContent = "En línea"; $("#sync-status").style.color = ""; });
window.addEventListener("offline", () => { $("#sync-status").textContent = "Sin conexión"; $("#sync-status").style.color = "var(--danger)"; });

await setPersistence(auth, browserLocalPersistence);
onAuthStateChanged(auth, async (user) => {
  state.unsubscribeCharacters?.();
  state.unsubscribeItems?.();
  state.unsubscribeMembers?.();
  state.member = null;
  state.characters = [];
  state.items = [];
  if (!user) {
    state.user = null;
    showOnly("login");
    return;
  }
  showOnly("loading");
  try {
    if (!(await resolveAccess(user))) {
      $("#denied-email").textContent = `${user.email} no está en la lista de la tripulación.`;
      showOnly("denied");
      return;
    }
    renderProfile();
    startRealtimeListeners();
    showOnly("app");
  } catch (error) {
    console.error(error);
    toast("No se pudo verificar el acceso.");
    await signOut(auth);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}
