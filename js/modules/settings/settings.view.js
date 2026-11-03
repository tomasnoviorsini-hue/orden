import { h, toast, confirmDialog, formatBytes } from '../../lib/ui.js';
import { periodFor, todayISO, toISO, formatShort } from '../../lib/date.js';
import { getSettings, updateSettings } from './settings.repo.js';
import {
  createBackupFile, downloadFile, getLastBackupAt, readBackupFile, restoreBackup,
} from '../../backup/backup.js';

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const dateOf = (timestamp) => formatShort(toISO(new Date(timestamp)));

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Compartir archivos (Android, iOS) permite guardar el respaldo en Drive, enviarlo por correo, etc.
function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  } catch {
    return false;
  }
}

export async function render(root) {
  const settings = await getSettings();

  // Período financiero

  const periodPreview = h('p', { class: 'muted' });
  const showPeriod = (day) => {
    periodPreview.textContent = `Período actual: ${periodFor(todayISO(), day).label}`;
  };

  const startDaySelect = h('select', {
    id: 'period-start',
    class: 'input',
    onchange: async () => {
      const day = Number(startDaySelect.value);
      await updateSettings({ periodStartDay: day });
      showPeriod(day);
      toast('Ajuste guardado.');
    },
  }, Array.from({ length: 28 }, (_, i) =>
    h('option', { value: String(i + 1), selected: i + 1 === settings.periodStartDay }, String(i + 1))
  ));
  showPeriod(settings.periodStartDay);

  // Almacenamiento

  const storageInfo = h('p', { class: 'muted' }, 'Consultando…');
  const persistButton = h('button', {
    class: 'btn',
    type: 'button',
    hidden: true,
    onclick: async () => {
      const granted = await navigator.storage.persist();
      toast(granted
        ? 'Almacenamiento persistente activado.'
        : 'El navegador no concedió el almacenamiento persistente. Suele concederse al instalar la aplicación.');
      refreshStorage();
    },
  }, 'Solicitar almacenamiento persistente');

  async function refreshStorage() {
    if (!navigator.storage?.estimate) {
      storageInfo.textContent = 'El navegador no informa el uso de almacenamiento.';
      return;
    }
    const [persisted, { usage = 0 }] = await Promise.all([
      navigator.storage.persisted?.() ?? false,
      navigator.storage.estimate(),
    ]);
    storageInfo.textContent = persisted
      ? `Uso: ${formatBytes(usage)}. Almacenamiento persistente: el navegador no borrará los datos automáticamente.`
      : `Uso: ${formatBytes(usage)}. Almacenamiento no persistente: el navegador podría borrar los datos si se queda sin espacio.`;
    persistButton.hidden = persisted;
  }

  // Respaldo

  const lastBackup = h('p', { class: 'muted' });

  async function showLastBackup() {
    const at = await getLastBackupAt();
    lastBackup.textContent = at
      ? `Último respaldo exportado: ${dateOf(at)}.`
      : 'Todavía no exportó ningún respaldo. Los datos solo existen en este dispositivo.';
  }

  async function exportBackup(share) {
    try {
      const file = await createBackupFile();
      if (share) await navigator.share({ files: [file], title: 'Respaldo de Orden' });
      else downloadFile(file);
      toast('Respaldo generado.');
    } catch (error) {
      if (error.name !== 'AbortError') toast(error.message || 'No se pudo generar el respaldo.');
    }
    showLastBackup();
  }

  async function importBackup(file) {
    let backup;
    try {
      backup = await readBackupFile(file);
    } catch (error) {
      toast(error.message || 'No se pudo leer el archivo.');
      return;
    }

    const { data, exportedAt } = backup;
    const confirmed = await confirmDialog({
      title: 'Importar respaldo',
      message: `Se reemplazarán todos los datos actuales por los del respaldo${exportedAt ? ` del ${dateOf(exportedAt)}` : ''}: `
        + `${count(data.transactions.length, 'movimiento', 'movimientos')}, `
        + `${count(data.tasks.length, 'tarea', 'tareas')} y `
        + `${count(data.categories.length, 'categoría', 'categorías')}. `
        + 'Esta acción no se puede deshacer; si lo necesita, exporte antes los datos actuales.',
      confirmLabel: 'Reemplazar datos',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await restoreBackup(backup);
    } catch (error) {
      toast(`No se pudo importar el respaldo; los datos actuales no se modificaron. ${error.message ?? ''}`);
      return;
    }
    toast('Respaldo importado.');
    rerender();
  }

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    onchange: () => {
      const [file] = fileInput.files;
      fileInput.value = '';
      if (file) importBackup(file);
    },
  });

  root.append(
    h('h2', { class: 'section-title' }, 'Período financiero'),
    h('div', { class: 'card stack' },
      h('div', { class: 'field' },
        h('label', { for: 'period-start' }, 'Día de inicio de cada período'),
        startDaySelect
      ),
      periodPreview
    ),

    h('h2', { class: 'section-title' }, 'Respaldo'),
    h('div', { class: 'card stack' },
      lastBackup,
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => exportBackup(false) }, 'Exportar datos'),
      canShareFiles() &&
        h('button', { class: 'btn btn-block', type: 'button', onclick: () => exportBackup(true) }, 'Compartir respaldo'),
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => fileInput.click() }, 'Importar datos'),
      h('p', { class: 'muted' }, 'Importar reemplaza todos los datos de este dispositivo por los del archivo.'),
      fileInput
    ),

    h('h2', { class: 'section-title' }, 'Almacenamiento'),
    h('div', { class: 'card stack' }, storageInfo, persistButton)
  );

  showLastBackup();
  refreshStorage();
}
