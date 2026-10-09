import { withoutTeachers } from './teachers.js';

export const groupKey = name => name.normalize('NFKC')
  .replace(/\s*\(\s*(?:9|11)\s*кл\.?\s*\)\s*$/iu, '')
  .replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '').toLocaleLowerCase('ru');
const subjectKey = name => withoutTeachers(name).replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};

export function installRupLink({ getLessons, getDate, applyLessons }) {
  const dialog = node('dialog', undefined, 'rup-link-dialog');
  dialog.setAttribute('aria-label', 'Сопоставление расписания с РУП');
  document.body.append(dialog);
  let busy = false;
  let plans = [];
  let selectedGroup = '';
  let semester = '';
  const title = node('h2', 'Связать расписание с РУП');
  const hint = node('p', 'Выберите группу и семестр. Проверьте предмет и преподавателя каждой пары. Каждое занятие учитывается как 2 академических часа.', 'hint');
  const notice = node('p'); notice.setAttribute('role', 'status');
  const filters = node('div', undefined, 'rup-link-filters');
  const group = node('select'); group.setAttribute('aria-label', 'Группа');
  const term = node('select'); term.setAttribute('aria-label', 'Семестр');
  for (const [value, label] of [['', 'Выберите семестр'], ['1', 'Первый семестр'], ['2', 'Второй семестр']]) {
    const option = node('option', label); option.value = value; term.append(option);
  }
  filters.append(group, term);
  const rows = node('div');
  const close = node('button', 'Закрыть', 'button'); close.type = 'button';
  dialog.append(title, hint, filters, notice, rows, close);
  close.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  group.addEventListener('change', () => { selectedGroup = group.value; render(); });
  term.addEventListener('change', () => { semester = term.value; render(); });

  async function api(path, body) {
    const token = sessionStorage.getItem('accessToken');
    if (!token) throw new Error('Войдите в аккаунт.');
    const response = await fetch(`http://localhost:3000/study-plans${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status === 403 ? 'Связывать занятия может администратор.' : result.message || `Ошибка ${response.status}`);
    return result;
  }

  function dayLessons() {
    const start = Date.parse(`${getDate()}T00:00:00+05:00`);
    return getLessons().filter(lesson => Date.parse(lesson.startsAt) >= start && Date.parse(lesson.startsAt) < start + 86400000);
  }

  function render() {
    rows.replaceChildren();
    if (!semester) { rows.append(node('p', 'Семестр выбирается вручную: даты семестров ещё не настроены.')); return; }
    const lessons = dayLessons().filter(lesson => lesson.groupName === selectedGroup);
    if (!lessons.length) rows.append(node('p', 'На выбранную дату занятий нет.'));
    for (const lesson of lessons) {
      const section = node('section', undefined, 'rup-link-row');
      const time = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Qyzylorda', hour: '2-digit', minute: '2-digit' }).format(new Date(lesson.startsAt));
      section.append(node('h3', `${time} · ${lesson.subject}`));
      if (lesson.assignmentId) section.append(node('p', 'Уже связано с РУП. Выбор другого назначения перенесёт учёт часов.', 'hint'));
      const localYear = Number(getDate().slice(0, 4)) - (Number(getDate().slice(5, 7)) < 9 ? 1 : 0);
      const candidates = plans.filter(plan => groupKey(plan.group.name) === groupKey(lesson.groupName)
        && String(plan.semester || plan.period.split(':')[1]) === semester
        && (plan.academicYear || plan.period.split(':')[0]) === `${localYear}-${localYear + 1}`)
        .flatMap(plan => plan.assignments.map(assignment => ({ ...assignment, plan })));
      if (!candidates.length) { section.append(node('p', 'Нет назначений РУП этой группы, учебного года и семестра.')); rows.append(section); continue; }
      const field = (labelText, control) => { const label = node('label', labelText); label.append(control); return label; };
      const select = () => {
        const el = node('select');
        const blank = node('option', 'Выберите назначение РУП'); blank.value = ''; el.append(blank);
        for (const a of candidates) {
          const option = node('option', `${a.plan.subject.name} · ${a.teacherLabel} · ${a.subgroupNumber ? `подгруппа ${a.subgroupNumber}` : 'вся группа'} · остаток ${a.remainingHours} ч`);
          option.value = a.id; el.append(option);
        }
        return el;
      };
      const first = select();
      const second = select();
      const exact = candidates.filter(a => subjectKey(a.plan.subject.name) === subjectKey(lesson.subject));
      if (lesson.assignmentId && candidates.some(a => a.id === lesson.assignmentId)) first.value = lesson.assignmentId;
      else if (exact.length === 1) first.value = exact[0].id;
      const split = node('input'); split.type = 'checkbox';
      const splitLabel = field('Разделить общую карточку на две подгруппы', split);
      const room1 = node('input'); room1.value = lesson.room; room1.required = true;
      const room2 = node('input'); room2.required = true;
      const secondField = field('Назначение второй подгруппы', second);
      const room2Field = field('Аудитория второй подгруппы', room2);
      secondField.hidden = room2Field.hidden = true;
      const check = node('input'); check.type = 'checkbox';
      const checkLabel = field('Предмет, преподаватели, семестр и аудитории проверены', check);
      const preview = node('p', '', 'hint');
      const message = node('p'); message.setAttribute('role', 'status');
      const save = node('button', 'Связать с РУП', 'button editor-primary'); save.type = 'button'; save.disabled = true;
      const refresh = () => {
        secondField.hidden = room2Field.hidden = !split.checked;
        const a = candidates.find(a => a.id === first.value);
        const b = candidates.find(a => a.id === second.value);
        const valid = a && (!split.checked || (b && a.studyPlanId === b.studyPlanId && a.subgroupNumber && b.subgroupNumber && a.subgroupNumber !== b.subgroupNumber));
        preview.textContent = a ? `После сохранения: ${a.plan.subject.name} · ${a.teacherLabel}${split.checked && b ? ` / ${b.teacherLabel}` : ''}. ${split.checked ? 'Две отдельные карточки по 2 ч.' : 'Одна карточка, 2 ч.'}` : '';
        if (a && a.remainingHours < 2 && lesson.assignmentId !== a.id) preview.textContent += ' Внимание: часы назначения будут превышены.';
        save.disabled = !valid || !check.checked || !room1.value.trim() || (split.checked && !room2.value.trim());
      };
      for (const input of [first, second, split, room1, room2]) input.addEventListener('input', () => { check.checked = false; refresh(); });
      check.addEventListener('change', refresh);
      section.append(field('Назначение', first), field('Аудитория', room1), splitLabel, secondField, room2Field, preview, checkLabel, message, save);
      refresh();
      save.addEventListener('click', async () => {
        refresh();
        if (busy || save.disabled) return;
        busy = true;
        for (const control of dialog.querySelectorAll('button,select,input')) control.disabled = true;
        message.textContent = 'Сохранение…';
        try {
          const result = await api('/link-lesson', { lessonId: lesson.id, updatedAt: lesson.updatedAt,
            assignmentIds: split.checked ? [first.value, second.value] : [first.value],
            rooms: split.checked ? [room1.value, room2.value] : [room1.value], confirmed: true });
          applyLessons(result.lessons);
          notice.textContent = 'Связь сохранена. Часы РУП пересчитаны.';
          try { plans = await api(''); } catch { notice.textContent += ' Не удалось обновить остатки — откройте окно заново.'; }
          render();
        } catch (error) { message.textContent = error instanceof TypeError ? 'Нет связи с сервером. Обновите расписание перед повторной попыткой.' : error.message; }
        finally {
          busy = false;
          for (const control of dialog.querySelectorAll('button,select,input')) control.disabled = false;
          // Restore confirmation-dependent save buttons after enabling controls.
          if (section.isConnected) refresh();
          else render();
        }
      });
      rows.append(section);
    }
  }

  document.querySelector('#rup-link-open').addEventListener('click', async () => {
    dialog.showModal();
    notice.textContent = 'Загрузка РУП…'; rows.replaceChildren();
    group.replaceChildren();
    for (const name of [...new Set(dayLessons().map(lesson => lesson.groupName))].sort()) {
      const option = node('option', name); option.value = name; group.append(option);
    }
    group.value = [...group.options].some(option => option.value === selectedGroup) ? selectedGroup : group.options[0]?.value || '';
    selectedGroup = group.value;
    term.value = semester;
    try { plans = await api(''); notice.textContent = ''; render(); }
    catch (error) { notice.textContent = error.message; }
  });
}
