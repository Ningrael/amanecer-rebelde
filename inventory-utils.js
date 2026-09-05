// Pure, shared UI logic. No credentials, storage or Firebase access.
export const normalizeText = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const isMaster = (character) => /^(master|gm|director de juego)$/.test(normalizeText(character?.name));
export const formatCredits = (value) => new Intl.NumberFormat('es-ES').format(Number(value) || 0);
export function filterItems(items, search = '', status = 'all', sort = 'name') {
  const words = normalizeText(search).split(/\s+/).filter(Boolean);
  return items.filter((item) => (status === 'all' || item.status === status) &&
    words.every((word) => normalizeText(`${item.name} ${item.notes} ${item.characterName || ''}`).includes(word)))
    .sort((a, b) => {
      if (sort === 'quantity') return b.quantity - a.quantity || a.name.localeCompare(b.name, 'es');
      if (sort === 'recent') return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0) || a.name.localeCompare(b.name, 'es');
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
    });
}
export function itemFingerprint(item) {
  return JSON.stringify([item.name, item.quantity, item.notes, item.status, item.updatedAt?.seconds, item.updatedAt?.nanoseconds]);
}
export function validateItem(item) {
  if (!item.name || item.name.length > 80) throw new Error('Escribí un nombre de hasta 80 caracteres.');
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999999) throw new Error('La cantidad debe ser un entero entre 1 y 999999.');
  if (item.notes.length > 400) throw new Error('Las notas admiten hasta 400 caracteres.');
  if (!['equipado', 'guardado'].includes(item.status)) throw new Error('Estado no válido.');
  return item;
}
