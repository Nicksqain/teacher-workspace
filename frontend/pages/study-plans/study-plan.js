const API = 'http://localhost:3000/study-plans';

const $ = selector => document.querySelector(selector);

const groupFilter = $('#group-filter');
const yearFilter = $('#year-filter');
const semesterFilter = $('#semester-filter');

const pageStatus = $('#page-status');
const plansBody = $('#plans-body');
const annualBody = $('#annual-body');

const dialog = $('#import-dialog');
const fileInput = $('#rup-file');
const importStatus = $('#import-status');
const previewBox = $('#import-preview');
const reviewed = $('#import-reviewed');
const saveButton = $('#save-import');
const closeButton = $('#close-import');

let plans = [];
let annualHours = [];
let pendingImport = null;
let busy = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(path = '', body) {
  const token = sessionStorage.getItem('accessToken');

  if (!token) {
    window.location.href = '../login/index.html';
    throw new Error('Сначала войдите в аккаунт.');
  }

  let response;

  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      'Нет связи с сервером. Если выполнялось сохранение, ' +
      'проверьте список планов перед повторной загрузкой.',
    );
  }

  if (response.status === 401) {
    sessionStorage.removeItem('accessToken');
    window.location.href = '../login/index.html';
    throw new Error('Сеанс истёк. Войдите повторно.');
  }

  if (response.status === 403) {
    throw new Error('Для этой операции недостаточно прав.');
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join('\n')
      : result?.message;

    throw new Error(message || `Ошибка сервера: ${response.status}`);
  }

  if (result === null) {
    throw new Error('Сервер вернул некорректный ответ.');
  }

  return result;
}

function yearOf(plan) {
  return plan.academicYear || plan.period?.split(':')[0] || '';
}

function semesterOf(plan) {
  return String(plan.semester || plan.period?.split(':')[1] || '');
}

function fillSelect(select, entries, placeholder) {
  const previous = select.value;

  select.replaceChildren();

  const first = element('option', placeholder);
  first.value = '';
  select.append(first);

  for (const [value, label] of entries) {
    const option = element('option', label);
    option.value = value;
    select.append(option);
  }

  if (entries.some(([value]) => value === previous)) {
    select.value = previous;
  }
}

function fillFilters() {
  const groups = new Map();
  const years = new Set();

  for (const item of [...plans, ...annualHours]) {
    if (item.group) groups.set(item.group.id, item.group.name);

    const year = yearOf(item);
    if (year) years.add(year);
  }

  fillSelect(
    groupFilter,
    [...groups].sort((a, b) => a[1].localeCompare(b[1], 'ru')),
    'Все группы',
  );

  fillSelect(
    yearFilter,
    [...years].sort().reverse().map(year => [year, year]),
    'Все годы',
  );
}

function matchesCommonFilters(item) {
  return (
    (!groupFilter.value || item.groupId === groupFilter.value) &&
    (!yearFilter.value || yearOf(item) === yearFilter.value)
  );
}

function addCell(row, text, className) {
  const cell = element('td', text, className);
  row.append(cell);
  return cell;
}

function addSubgroup(row, number) {
  const cell = addCell(row);
  cell.append(
    element(
      'span',
      number ? `Подгруппа ${number}` : 'Вся группа',
      'badge',
    ),
  );
}

function render() {
  plansBody.replaceChildren();
  annualBody.replaceChildren();

  const visiblePlans = plans.filter(plan =>
    matchesCommonFilters(plan) &&
    (!semesterFilter.value ||
      semesterOf(plan) === semesterFilter.value),
  );

  let assignmentCount = 0;
  let needsLinking = 0;
  let missingHours = 0;

  for (const plan of visiblePlans) {
    needsLinking += plan.unassignedLessons || 0;

    // Старый план может ещё не иметь назначений.
    const assignments = plan.assignments?.length
      ? plan.assignments
      : [null];

    for (const assignment of assignments) {
      const row = element('tr');
      const subject = addCell(row, plan.subject?.name || 'Без предмета');

      if (plan.unassignedLessons) {
        subject.append(
          element(
            'span',
            `Без назначения: ${plan.unassignedLessons} занятий`,
            'cell-note',
          ),
        );
      }

      if (!assignment) {
        subject.append(
          element('span', 'Назначения ещё не созданы', 'cell-note'),
        );
      }

      addCell(row, plan.group?.name || '—');
      addCell(
        row,
        `${semesterOf(plan) || '—'} · ${yearOf(plan)}`,
      );

      addCell(
        row,
        assignment?.teacher?.fullName ||
          assignment?.teacherLabel ||
          'Не назначен',
      );

      if (assignment) {
        addSubgroup(row, assignment.subgroupNumber);
      } else {
        addCell(row, 'Не определена');
      }

      addCell(
        row,
        assignment?.totalHours ?? plan.totalHours,
        'number',
      );

      addCell(row, assignment?.plannedHours ?? '—', 'number');

      const remaining = assignment?.remainingHours;
      const remainingCell = addCell(
        row,
        remaining ?? '—',
        `number remaining${remaining < 0 ? ' overload' : ''}`,
      );

      if (assignment?.uncountedLessons) {
        missingHours += assignment.uncountedLessons;

        remainingCell.append(
          element(
            'span',
            `Без часов: ${assignment.uncountedLessons} занятий`,
            'cell-note',
          ),
        );
      }

      plansBody.append(row);
      if (assignment) addEditActions(subject, 'assignment', assignment, `${plan.subject?.name} · ${plan.group?.name} · ${semesterOf(plan)} семестр`);
      if (assignment) assignmentCount++;
    }
  }

  // Годовые часы не фильтруем по семестру.
  const visibleAnnual = annualHours.filter(item =>
    matchesCommonFilters(item) &&
    (item.examHours || item.consultationHours || item.projectHours),
  );

  for (const item of visibleAnnual) {
    const row = element('tr');

    addCell(row, item.subject?.name || 'Без предмета');
    addCell(row, item.group?.name || '—');
    addCell(row, item.academicYear);
    addCell(row, item.teacherLabel || 'Не назначен');
    addSubgroup(row, item.subgroupNumber);
    addCell(row, item.examHours, 'number');
    addCell(row, item.consultationHours, 'number');
    addCell(row, item.projectHours, 'number');

    annualBody.append(row);
    addEditActions(row.firstElementChild, 'annual', item, `${item.subject?.name} · ${item.group?.name} · ${item.academicYear}`);
  }

  $('#plans-empty').hidden = visiblePlans.length > 0;
  $('#annual-empty').hidden = visibleAnnual.length > 0;

  pageStatus.textContent =
    `Планов: ${visiblePlans.length} · Назначений: ${assignmentCount}`;

  if (needsLinking || missingHours) {
    pageStatus.textContent +=
      ` · Требуют проверки: ${needsLinking + missingHours} занятий`;
  }
}

async function loadPlans() {
  const [loadedPlans, loadedAnnual] = await Promise.all([
    request(),
    request('/annual-hours'),
  ]);

  if (!Array.isArray(loadedPlans) || !Array.isArray(loadedAnnual)) {
    throw new Error('Сервер вернул неверный формат списка планов.');
  }

  plans = loadedPlans;
  annualHours = loadedAnnual;

  fillFilters();
  render();
}

for (const filter of [groupFilter, yearFilter, semesterFilter]) {
  filter.addEventListener('change', render);
}

function updateImportControls() {
  fileInput.disabled = busy;
  closeButton.disabled = busy;
  reviewed.disabled = busy || !pendingImport;
  saveButton.disabled = busy || !pendingImport || !reviewed.checked;
  saveButton.textContent = busy ? 'Подождите…' : 'Сохранить РУП';
  dialog.setAttribute('aria-busy', String(busy));
}

function resetPreview() {
  pendingImport = null;
  reviewed.checked = false;
  previewBox.replaceChildren();
  updateImportControls();
}

$('#open-import').addEventListener('click', () => {
  resetPreview();
  fileInput.value = '';
  importStatus.textContent = 'Выберите файл для предпросмотра.';
  dialog.showModal();
});

closeButton.addEventListener('click', () => {
  if (!busy) dialog.close();
});

dialog.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
});

reviewed.addEventListener('change', updateImportControls);

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));

    reader.readAsDataURL(file);
  });
}

function renderPreview(preview) {
  const table = element('table');
  const caption = element('caption', `РУП · ${preview.academicYear}`);
  const head = element('thead');
  const header = element('tr');

  const titles = [
    'Строка',
    'Группа',
    'Предмет',
    'Преподаватель',
    '1 семестр, ч',
    '2 семестр, ч',
    'Экзамены за год',
    'Консультации за год',
    'Курсовые за год',
    'Примечания',
  ];

  for (const title of titles) {
    const cell = element('th', title);
    cell.scope = 'col';
    header.append(cell);
  }

  head.append(header);

  const body = element('tbody');

  for (const item of preview.rows) {
    const row = element('tr');

    addCell(row, item.sourceRow);
    addCell(row, item.groupName);
    addCell(row, item.subject);
    addCell(row, item.teacher || 'Не назначен');
    addCell(row, item.semester1Hours, 'number');
    addCell(row, item.semester2Hours, 'number');
    addCell(row, item.examHours, 'number');
    addCell(row, item.consultationHours, 'number');
    addCell(row, item.projectHours, 'number');
    addCell(row, (item.warnings || []).join('. '));

    body.append(row);
  }

  table.append(caption, head, body);
  previewBox.replaceChildren(table);
}

fileInput.addEventListener('change', async () => {
  resetPreview();
  importStatus.textContent = '';

  const file = fileInput.files[0];
  if (!file) return;

  if (
    !/\.xlsx$/i.test(file.name) ||
    !file.size ||
    file.size > 4 * 1024 * 1024
  ) {
    importStatus.textContent = 'Выберите непустой файл .xlsx до 4 МБ.';
    return;
  }

  busy = true;
  updateImportControls();
  importStatus.textContent = 'Чтение РУП…';

  try {
    const fileData = await readBase64(file);
    const preview = await request('/excel/preview', { file: fileData });

    if (!Array.isArray(preview.rows) || !preview.rows.length) {
      throw new Error('В файле не найдены строки учебного плана.');
    }

    renderPreview(preview);

    pendingImport = {
      file: fileData,
      academicYear: preview.academicYear,
      groupNames: [...new Set(preview.rows.map(row => row.groupName))],
    };

    importStatus.textContent =
      `${preview.academicYear} · Строк: ${preview.rows.length}.\n` +
      'Проверьте предметы, часы и распределение преподавателей. ' +
      'Номера подгрупп назначаются по порядку строк предмета в файле. НВТП — для всей группы.';

    if (preview.requiresReview) {
      importStatus.textContent += '\nВ таблице есть примечания.';
    }
  } catch (error) {
    importStatus.textContent = error.message;
  } finally {
    busy = false;
    updateImportControls();
  }
});

saveButton.addEventListener('click', async () => {
  if (busy || !pendingImport || !reviewed.checked) return;

  const selected = pendingImport;

  busy = true;
  updateImportControls();
  importStatus.textContent = 'Сохранение РУП…';

  try {
    const result = await request('/excel/import', {
      file: selected.file,
      confirmed: true,
    });

    const success =
      `РУП сохранён. Планов: ${result.plansCreated}, ` +
      `назначений: ${result.assignmentsCreated}, ` +
      `записей годовых часов: ${result.annualHoursCreated}.`;

    resetPreview();
    fileInput.value = '';
    importStatus.textContent = success;

    try {
      await loadPlans();

      yearFilter.value = selected.academicYear;
      semesterFilter.value = '';
      groupFilter.value = '';

      if (selected.groupNames.length === 1) {
        const group = [...plans, ...annualHours]
          .map(item => item.group)
          .find(item => item?.name === selected.groupNames[0]);

        if (group) groupFilter.value = group.id;
      }

      render();
      pageStatus.textContent += ` · ${success}`;
      dialog.close();
    } catch (error) {
      importStatus.textContent =
        `${success}\nНе удалось обновить таблицы: ${error.message}\n` +
        'Обновите страницу. Повторно сохранять файл не нужно.';
    }
  } catch (error) {
    // Для новой попытки повторно читаем файл и делаем предпросмотр.
    resetPreview();
    fileInput.value = '';
    importStatus.textContent =
      `${error.message}\nДля новой попытки выберите файл заново.`;
  } finally {
    busy = false;
    updateImportControls();
  }
});

for (const container of document.querySelectorAll('.table-scroll')) {
  container.tabIndex = 0;
}

loadPlans().catch(error => {
  pageStatus.textContent = error.message;
});

const editDialog = element('dialog');
editDialog.setAttribute('aria-label', 'Редактирование учебного плана');
document.body.append(editDialog);
let editBusy = false;
editDialog.addEventListener('cancel', event => { if (editBusy) event.preventDefault(); });
const editLabels = {
  teacherLabel: 'Преподаватель / вакансия', totalHours: 'Часы по РУП',
  examHours: 'Экзамены за год, ч', consultationHours: 'Консультации за год, ч', projectHours: 'Курсовые за год, ч',
};

function addEditActions(cell, kind, record, title) {
  const actions = element('div', undefined, 'record-actions');
  const edit = element('button', 'Редактировать');
  edit.type = 'button';
  edit.addEventListener('click', () => openPlanEditor(kind, record, title));
  actions.append(edit);
  cell.append(actions);
}

function openPlanEditor(kind, record, title) {
  editDialog.replaceChildren();
  const form = element('form', undefined, 'plan-edit-form');
  form.append(element('h2', 'Редактировать РУП'), element('p', title, 'hint'));
  form.append(element('p', 'Изменения относятся к этой строке РУП. Уже составленное расписание и назначения в других семестрах не изменятся.', 'hint'));
  const keys = kind === 'assignment' ? ['teacherLabel', 'totalHours'] : ['teacherLabel', 'examHours', 'consultationHours', 'projectHours'];
  const original = Object.fromEntries(keys.map(key => [key, record[key]]));
  for (const key of keys) {
    const label = element('label', editLabels[key]);
    const input = element('input');
    input.name = key;
    input.type = key === 'teacherLabel' ? 'text' : 'number';
    input.value = record[key];
    input.required = true;
    if (input.type === 'number') { input.min = '0'; input.max = '10000'; input.step = '1'; }
    else input.maxLength = 300;
    label.append(input);
    form.append(label);
  }
  const warning = element('p', '', 'cell-note');
  const allowLabel = element('label', undefined, 'confirmation');
  const allow = element('input');
  allow.type = 'checkbox';
  allowLabel.append(allow, document.createTextNode('Сохранить с превышением запланированных часов'));
  allowLabel.hidden = true;
  if (kind === 'assignment') {
    form.append(element('p', `Запланировано: ${record.plannedHours} ч. Занятий без указанных часов: ${record.uncountedLessons || 0}.`, 'hint'));
    const refreshWarning = () => {
      const excess = record.plannedHours - Number(form.elements.totalHours.value);
      warning.textContent = excess > 0 ? `В расписании на ${excess} ч больше нового плана.` : '';
      allowLabel.hidden = excess <= 0;
      allow.checked = false;
    };
    form.elements.totalHours.addEventListener('input', refreshWarning);
    refreshWarning();
  }
  const message = element('p');
  message.setAttribute('role', 'status');
  const actions = element('div', undefined, 'dialog-actions');
  const close = element('button', 'Отмена'); close.type = 'button';
  close.addEventListener('click', () => { if (!editBusy) editDialog.close(); });
  const save = element('button', 'Сохранить'); save.type = 'submit';
  actions.append(close, save);
  form.append(warning, allowLabel, message, actions);
  const history = element('details');
  history.append(element('summary', 'История изменений'));
  const historyBody = element('div'); history.append(historyBody);
  let historyLoaded = false;
  history.addEventListener('toggle', async () => {
    if (!history.open || historyLoaded) return;
    historyLoaded = true;
    historyBody.textContent = 'Загрузка…';
    try {
      const changes = await request(`/history/${kind}/${record.id}`);
      historyBody.replaceChildren();
      if (!changes.length) historyBody.textContent = 'Изменений пока нет.';
      for (const change of changes) {
        const entry = element('p', new Date(change.createdAt).toLocaleString('ru-RU'));
        for (const key of keys) if (change.before[key] !== change.after[key]) {
          entry.append(element('div', `${editLabels[key]}: ${change.before[key]} → ${change.after[key]}`));
        }
        historyBody.append(entry);
      }
    } catch (error) { historyBody.textContent = error.message; historyLoaded = false; }
  });
  form.append(history);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (editBusy || !form.reportValidity()) return;
    if (!allowLabel.hidden && !allow.checked) { message.textContent = 'Подтвердите превышение или исправьте часы.'; return; }
    const data = Object.fromEntries(keys.map(key => [key, key === 'teacherLabel' ? form.elements[key].value.trim() : Number(form.elements[key].value)]));
    editBusy = true;
    for (const control of form.elements) control.disabled = true;
    message.textContent = 'Сохранение…';
    try {
      await request(`/edit/${kind}/${record.id}`, { ...data, original, allowOverload: allow.checked });
      save.hidden = true;
      close.textContent = 'Закрыть';
      try {
        await loadPlans();
        editDialog.close();
        pageStatus.textContent += ' · Изменения РУП сохранены';
      } catch (error) {
        message.textContent = `Изменения сохранены. Обновите страницу: ${error.message}`;
      }
    } catch (error) { message.textContent = error.message; }
    finally {
      editBusy = false;
      for (const control of form.elements) control.disabled = false;
    }
  });
  editDialog.append(form);
  editDialog.showModal();
}
