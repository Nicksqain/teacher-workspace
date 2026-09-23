const table = document.querySelector('#schedule-table');
const status = document.querySelector('#schedule-status');
const search = document.querySelector('#group-search');
let schedule;
let selectedCourse = '1';
let allLessons = [];
let editingId = null;
let saving = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function render() {
  if (!schedule) return;
  // The API request may still be loading when a filter is clicked.
  if (
    schedule.groups.some((group) =>
      group.lessons.some((slot) => !Array.isArray(slot)),
    )
  )
    return;

  const query = search.value.trim().toLocaleLowerCase('ru');
  const groups = schedule.groups.filter(
    (group) =>
      (selectedCourse === 'all' || String(group.course) === selectedCourse) &&
      group.name.toLocaleLowerCase('ru').includes(query),
  );
  const head = table.tHead;
  const body = table.tBodies[0];
  head.replaceChildren();
  body.replaceChildren();
  table.hidden = groups.length === 0;
  document.querySelector('#empty-state').hidden = groups.length !== 0;
  const count = groups.reduce(
    (total, group) =>
      total + group.lessons.reduce((sum, lessons) => sum + lessons.length, 0),
    0,
  );
  status.textContent = `Групп: ${groups.length} · Занятий: ${count}`;
  if (!groups.length) return;

  const courses = element('tr');
  const corner = element('th', 'Пара / время', 'time-column corner');
  corner.rowSpan = 2;
  corner.scope = 'col';
  courses.append(corner);
  for (const course of [1, 2, 3, 4]) {
    const courseGroups = groups.filter((group) => group.course === course);
    if (!courseGroups.length) continue;
    const cell = element(
      'th',
      `${course} курс`,
      `course-heading course-${course}`,
    );
    cell.colSpan = courseGroups.length;
    cell.scope = 'colgroup';
    courses.append(cell);
  }

  const names = element('tr');
  for (const group of groups) {
    const cell = element('th', group.name, 'group-heading');
    cell.scope = 'col';
    names.append(cell);
  }
  head.append(courses, names);

  schedule.slots.forEach((slot, index) => {
    const row = element('tr');
    const time = element('th', undefined, 'time-column');
    time.scope = 'row';
    time.append(
      element('strong', `${slot.number} пара`),
      element('span', slot.time),
    );
    row.append(time);

    for (const group of groups) {
      const cell = element('td');
      const lessons = group.lessons[index];
      if (lessons.length > 0) {
        for (const lesson of lessons) {
          const card = element(
            'article',
            undefined,
            `lesson course-${group.course}`,
          );
          card.dataset.id = lesson.id;
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-haspopup', 'dialog');
          card.setAttribute(
            'aria-label',
            `Редактировать: ${lesson.subject}, ${group.name}`,
          );
          card.title = 'Нажмите, чтобы изменить занятие';
          card.append(
            element('h3', lesson.subject),
            element('p', `Аудитория: ${lesson.room}`),
          );
          cell.append(card);
        }
      } else {
        cell.append(element('span', '—', 'empty-cell'));
        cell.setAttribute('aria-label', 'Нет занятия');
      }
      row.append(cell);
    }
    body.append(row);
  });
}

for (const button of document.querySelectorAll('[data-course]')) {
  button.addEventListener('click', () => {
    selectedCourse = button.dataset.course;
    for (const tab of document.querySelectorAll('[data-course]')) {
      tab.setAttribute('aria-pressed', String(tab === button));
    }
    document.querySelector('.table-scroll').scrollLeft = 0;
    render();
  });
}
search.addEventListener('input', render);
document
  .querySelector('#print')
  .addEventListener('click', () => window.print());

async function init() {
  const token = sessionStorage.getItem('accessToken');

  if (!token) {
    window.location.href = '../login/index.html';
    return;
  }

  try {
    const fileResponse = await fetch(
      new URL('./schedule-data.json', import.meta.url),
    );

    if (!fileResponse.ok) {
      throw new Error('Не удалось загрузить структуру расписания');
    }

    schedule = await fileResponse.json();

    const response = await fetch('http://localhost:3000/schedule', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status == 401) {
      sessionStorage.removeItem('accessToken');
      window.location.href = '../login/index.html';
      return;
    }

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`);
    }

    allLessons = await response.json();
    arrangeLessons();

    render();
  } catch (error) {
    status.textContent = error.message;
  }
}
init();

async function updateLesson(id, data) {
  const token = sessionStorage.getItem('accessToken');

  if (!token) {
    throw new Error('Сначала войдите в систему');
  }

  const response = await fetch(
    `http://localhost:3000/schedule/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Сеанс истёк. Войдите в систему повторно.');
    if (response.status === 403)
      throw new Error('Редактирование доступно только администратору.');
    if (response.status === 404)
      throw new Error('Занятие удалено. Обновите страницу.');
    const error = await response.json().catch(() => ({}));

    throw new Error(error.message || `Ошибка сохранения: ${response.status}`);
  }

  return response.json();
}

function slotDates(slot) {
  const [start, end] = slot.time
    .split('–')
    .map((value) => value.padStart(5, '0'));
  return {
    startsAt: `${schedule.date}T${start}:00+05:00`,
    endsAt: `${schedule.date}T${end}:00+05:00`,
  };
}

function arrangeLessons() {
  for (const group of schedule.groups) {
    group.lessons = schedule.slots.map((slot) => {
      const start = new Date(slotDates(slot).startsAt).getTime();
      return allLessons.filter(
        (lesson) =>
          lesson.groupName === group.name &&
          new Date(lesson.startsAt).getTime() === start,
      );
    });
  }
}

const editor = document.querySelector('#lesson-editor');
const form = document.querySelector('#lesson-form');
const editorStatus = document.querySelector('#editor-status');
const saveButton = document.querySelector('#editor-save');
let opener;

function openEditor(id, card) {
  const lesson = allLessons.find((item) => item.id === id);
  if (!lesson || saving) return;
  editingId = id;
  opener = card;
  form.reset();
  editorStatus.textContent = '';
  form.elements.subject.value = lesson.subject;
  form.elements.room.value = lesson.room;
  form.elements.groupName.replaceChildren();
  for (const group of schedule.groups) {
    const option = element('option', group.name);
    option.value = group.name;
    form.elements.groupName.append(option);
  }
  form.elements.groupName.value = lesson.groupName;
  form.elements.slot.replaceChildren();
  schedule.slots.forEach((slot, index) => {
    const option = element('option', `${slot.number} пара · ${slot.time}`);
    option.value = String(index);
    form.elements.slot.append(option);
  });
  const index = schedule.slots.findIndex(
    (slot) =>
      new Date(slotDates(slot).startsAt).getTime() ===
      new Date(lesson.startsAt).getTime(),
  );
  form.elements.slot.value = String(index);
  editor.showModal();
  form.elements.subject.focus();
}

function closeEditor() {
  if (!saving) editor.close();
}

table.addEventListener('click', (event) => {
  const card = event.target.closest('.lesson[data-id]');
  if (card) openEditor(card.dataset.id, card);
});
table.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.lesson[data-id]');
  if (!card) return;
  event.preventDefault();
  openEditor(card.dataset.id, card);
});
document.querySelector('#editor-close').addEventListener('click', closeEditor);
document.querySelector('#editor-cancel').addEventListener('click', closeEditor);
editor.addEventListener('cancel', (event) => {
  if (saving) event.preventDefault();
});
editor.addEventListener('close', () => {
  editingId = null;
  if (opener?.isConnected) opener.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !editingId || !form.reportValidity()) return;
  const slot = schedule.slots[Number(form.elements.slot.value)];
  const groupName = form.elements.groupName.value;
  const subject = form.elements.subject.value.trim();
  const room = form.elements.room.value.trim();
  if (
    !slot ||
    !subject ||
    !room ||
    !schedule.groups.some((group) => group.name === groupName)
  ) {
    editorStatus.textContent =
      'Заполните предмет, группу, аудиторию и выберите пару.';
    return;
  }
  const original = allLessons.find((lesson) => lesson.id === editingId);
  const sameSlot =
    new Date(original.startsAt).getTime() ===
    new Date(slotDates(slot).startsAt).getTime();
  // Preserve the original end time unless the user explicitly changes the pair.
  const dates = sameSlot
    ? { startsAt: original.startsAt, endsAt: original.endsAt }
    : slotDates(slot);
  saving = true;
  for (const control of form.elements) control.disabled = true;
  saveButton.textContent = 'Сохранение…';
  editorStatus.textContent = '';
  try {
    const updated = await updateLesson(editingId, {
      subject,
      groupName,
      room,
      ...dates,
    });
    if (!updated?.id)
      throw new Error(
        'Сервер не вернул сохранённое занятие. Обновите страницу.',
      );
    allLessons = allLessons.map((lesson) =>
      lesson.id === updated.id ? updated : lesson,
    );
    arrangeLessons();
    const target = schedule.groups.find(
      (group) => group.name === updated.groupName,
    );
    if (selectedCourse !== 'all') selectedCourse = String(target.course);
    if (
      !updated.groupName
        .toLocaleLowerCase('ru')
        .includes(search.value.trim().toLocaleLowerCase('ru'))
    )
      search.value = '';
    for (const button of document.querySelectorAll('[data-course]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.course === selectedCourse),
      );
    }
    render();
    saving = false;
    editor.close();
    const savedCard = [...table.querySelectorAll('.lesson[data-id]')].find(
      (card) => card.dataset.id === updated.id,
    );
    savedCard?.focus();
    status.textContent += ' · Изменения сохранены';
  } catch (error) {
    editorStatus.textContent =
      error instanceof TypeError
        ? 'Нет связи с сервером. Изменения не подтверждены; попробуйте сохранить снова.'
        : error.message;
  } finally {
    saving = false;
    for (const control of form.elements) control.disabled = false;
    saveButton.textContent = 'Сохранить';
  }
});
