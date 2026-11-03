import { withTx, promisify, getAllByIndex, put } from '../../db/idb.js';
import { uid } from '../../lib/id.js';

const STORE = 'tasks';
export const TITLE_MAX = 200;

// Pendientes primero; dentro de cada grupo, por orden de creación.
const sortTasks = (tasks) =>
  tasks.sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);

function cleanTitle(title) {
  const value = String(title ?? '').trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('La tarea no puede estar vacía.');
  return value.slice(0, TITLE_MAX);
}

export async function listByDate(date) {
  return sortTasks(await getAllByIndex(STORE, 'date', date));
}

/** Tareas sin completar de días anteriores a `date`, agrupadas por día (más reciente primero). */
export async function listPendingBefore(date) {
  const tasks = await getAllByIndex(STORE, 'date', IDBKeyRange.upperBound(date, true));
  const groups = new Map();
  tasks
    .filter((task) => !task.done)
    .sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order)
    .forEach((task) => {
      if (!groups.has(task.date)) groups.set(task.date, []);
      groups.get(task.date).push(task);
    });
  return [...groups].map(([groupDate, groupTasks]) => ({ date: groupDate, tasks: groupTasks }));
}

/** Cantidad total y pendiente de tareas por día dentro del rango [start, end]. */
export async function statsByDateRange(start, end) {
  const tasks = await getAllByIndex(STORE, 'date', IDBKeyRange.bound(start, end));
  const stats = new Map();
  for (const task of tasks) {
    const day = stats.get(task.date) ?? { total: 0, pending: 0 };
    day.total++;
    if (!task.done) day.pending++;
    stats.set(task.date, day);
  }
  return stats;
}

export async function createTask(date, title) {
  const now = new Date().toISOString();
  const task = {
    id: uid(),
    date,
    title: cleanTitle(title),
    done: false,
    doneAt: null,
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
  };
  await put(STORE, task);
  return task;
}

function updateTask(id, change) {
  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const task = await promisify(store.get(id));
    if (!task) throw new Error('La tarea ya no existe.');
    const updated = { ...task, ...change(task), updatedAt: new Date().toISOString() };
    store.put(updated);
    return updated;
  });
}

export function renameTask(id, title) {
  const clean = cleanTitle(title);
  return updateTask(id, () => ({ title: clean }));
}

export function setTaskDone(id, done) {
  return updateTask(id, () => ({ done, doneAt: done ? new Date().toISOString() : null }));
}

/** Elimina la tarea y la devuelve, para poder deshacer. */
export function deleteTask(id) {
  return withTx(STORE, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE);
    const task = await promisify(store.get(id));
    if (task) store.delete(id);
    return task ?? null;
  });
}

export const restoreTask = (task) => put(STORE, task);
