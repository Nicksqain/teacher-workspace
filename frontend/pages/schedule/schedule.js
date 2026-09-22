const table = document.querySelector('#schedule-table');
const status = document.querySelector('#schedule-status');
const search = document.querySelector('#group-search');
let schedule;
let selectedCourse = '1';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function render() {
  if (!schedule) return;
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
    (total, group) => total + group.lessons.filter(Boolean).length,
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
    if (slot.number === 3) time.append(element('small', 'После обеда'));
    row.append(time);
    for (const group of groups) {
      const cell = element('td');
      const text = group.lessons[index];
      if (text) {
        const card = element(
          'article',
          undefined,
          `lesson course-${group.course}`,
        );
        // Preserve the complete cell text, including subgroup teachers and rooms.
        const split = text.indexOf('(');
        card.append(
          element('h3', split > 0 ? text.slice(0, split).trim() : text),
        );
        if (split > 0) card.append(element('p', text.slice(split)));
        cell.append(card);
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
  try {
    const response = await fetch(
      new URL('./schedule-data.json', import.meta.url),
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    schedule = await response.json();
    render();
  } catch (error) {
    status.textContent =
      'Не удалось загрузить файл расписания. Обновите страницу.';
    console.error(error);
  }
}
init();
