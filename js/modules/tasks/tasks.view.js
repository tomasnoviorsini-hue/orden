import { h, icon, toast, promptDialog, setAppBar } from '../../lib/ui.js';
import { todayISO, addDays, toISO, fromISO, formatLong, formatWeekdayNarrow, startOfWeek } from '../../lib/date.js';
import { navigate } from '../../router.js';
import * as repo from './tasks.repo.js';

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && toISO(fromISO(value)) === value;

const dayPath = (date, today) => (date === today ? 'tareas' : `tareas/${date}`);

function relativeName(date, today) {
  if (date === today) return 'Hoy';
  if (date === addDays(today, -1)) return 'Ayer';
  if (date === addDays(today, 1)) return 'Mañana';
  return null;
}

export async function render(root, [param]) {
  const today = todayISO();
  const date = isValidDate(param) ? param : today;
  const isToday = date === today;
  const relative = relativeName(date, today);

  if (!isToday) {
    setAppBar('Tareas', h('button', { class: 'btn btn-sm', type: 'button', onclick: () => navigate('tareas') }, 'Ir a hoy'));
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      toast(error.message || 'Ocurrió un error.');
    }
    await refresh();
  }

  // Encabezado del día con navegación

  const picker = h('input', {
    type: 'date',
    class: 'visually-hidden',
    value: date,
    tabindex: '-1',
    'aria-hidden': 'true',
    onchange: () => {
      if (isValidDate(picker.value)) navigate(dayPath(picker.value, today));
    },
  });

  const openPicker = () => {
    try { picker.showPicker(); } catch { picker.focus(); }
  };

  const progress = h('span', { class: 'muted' });

  const header = h('div', { class: 'card daynav' },
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Día anterior',
      onclick: () => navigate(dayPath(addDays(date, -1), today)),
    }, icon('chevron-left')),
    h('button', { class: 'daynav-label', type: 'button', 'aria-label': 'Elegir fecha', onclick: openPicker },
      h('strong', null, relative ?? formatLong(date)),
      relative && h('span', { class: 'muted' }, formatLong(date)),
      progress
    ),
    h('button', {
      class: 'btn btn-icon', type: 'button', 'aria-label': 'Día siguiente',
      onclick: () => navigate(dayPath(addDays(date, 1), today)),
    }, icon('chevron-right')),
    picker
  );

  // Semana del día elegido (lunes a domingo)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const weekStrip = h('div', { class: 'weekstrip', role: 'group', 'aria-label': 'Semana' });

  function weekDayButton(day, stats) {
    const classes = ['weekday'];
    if (day === date) classes.push('is-selected');
    if (day === today) classes.push('is-today');
    const dot = stats?.pending ? 'has-pending' : stats?.total ? 'all-done' : '';
    return h('button', {
      class: classes.join(' '),
      type: 'button',
      'aria-pressed': String(day === date),
      'aria-label': stats?.pending ? `${formatLong(day)}, ${stats.pending} pendientes` : formatLong(day),
      onclick: () => navigate(dayPath(day, today)),
    },
      h('span', { class: 'weekday-name' }, formatWeekdayNarrow(day)),
      h('span', { class: 'weekday-num' }, String(fromISO(day).getDate())),
      h('span', { class: `weekday-dot ${dot}` })
    );
  }

  // Alta de tareas

  const placeholder = isToday
    ? 'Nueva tarea para hoy'
    : relative === 'Mañana' ? 'Nueva tarea para mañana' : 'Nueva tarea para este día';

  const input = h('input', {
    class: 'input',
    type: 'text',
    placeholder,
    maxlength: String(repo.TITLE_MAX),
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-label': 'Nueva tarea',
  });

  const form = h('form', {
    class: 'add-task',
    onsubmit: (event) => {
      event.preventDefault();
      const title = input.value;
      if (!title.trim()) return;
      input.value = '';
      input.focus();
      run(() => repo.createTask(date, title));
    },
  },
    input,
    h('button', { class: 'btn btn-primary btn-square', type: 'submit', 'aria-label': 'Agregar tarea' }, icon('plus'))
  );

  // Listas

  const dayList = h('ul', { class: 'list card card-flush' });
  const pendingSection = h('section', { hidden: true });

  async function edit(task) {
    const title = await promptDialog({ title: 'Editar tarea', value: task.title, maxLength: repo.TITLE_MAX });
    if (title == null || title.trim() === task.title) return;
    run(() => repo.renameTask(task.id, title));
  }

  function remove(task) {
    run(async () => {
      const deleted = await repo.deleteTask(task.id);
      if (!deleted) return;
      toast('Tarea eliminada.', {
        actionLabel: 'Deshacer',
        duration: 5000,
        onAction: () => run(() => repo.restoreTask(deleted)),
      });
    });
  }

  function taskItem(task) {
    return h('li', { class: task.done ? 'task is-done' : 'task' },
      h('button', {
        class: 'task-main', type: 'button', role: 'checkbox', 'aria-checked': String(task.done),
        onclick: () => run(() => repo.setTaskDone(task.id, !task.done)),
      },
        h('span', { class: 'task-box' }, icon('check')),
        h('span', { class: 'task-title' }, task.title)
      ),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Editar tarea', onclick: () => edit(task) }, icon('edit')),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Eliminar tarea', onclick: () => remove(task) }, icon('trash'))
    );
  }

  async function refresh() {
    const [tasks, weekStats, pending] = await Promise.all([
      repo.listByDate(date),
      repo.statsByDateRange(weekDays[0], weekDays[6]),
      isToday ? repo.listPendingBefore(today) : [],
    ]);

    const doneCount = tasks.filter((task) => task.done).length;
    progress.textContent = tasks.length ? `${doneCount} de ${tasks.length} hechas` : 'Sin tareas';

    weekStrip.replaceChildren(...weekDays.map((day) => weekDayButton(day, weekStats.get(day))));

    dayList.replaceChildren(...(tasks.length
      ? tasks.map(taskItem)
      : [h('li', { class: 'list-empty' }, 'No hay tareas para este día.')]));

    const pendingCount = pending.reduce((total, group) => total + group.tasks.length, 0);
    pendingSection.hidden = pendingCount === 0;
    pendingSection.replaceChildren(
      h('h2', { class: 'section-title' }, `Tareas no completadas (${pendingCount})`),
      ...pending.map((group) => {
        const groupRelative = relativeName(group.date, today);
        return h('div', { class: 'pending-group' },
          h('a', { class: 'group-title', href: `#/${dayPath(group.date, today)}` },
            `${groupRelative ? `${groupRelative} · ` : ''}${formatLong(group.date)}`),
          h('ul', { class: 'list card card-flush' }, group.tasks.map(taskItem))
        );
      })
    );
  }

  root.append(header, weekStrip, form, dayList, pendingSection);
  await refresh();

  // Si la app queda abierta y cambia el día, volver a dibujar con la fecha nueva.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && todayISO() !== today) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}
