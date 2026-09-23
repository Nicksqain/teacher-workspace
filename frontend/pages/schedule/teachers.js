import { teachersOf } from './conflicts.js';

export function withoutTeachers(subject) {
  return subject
    .replace(/\(([^()]*)\)/gu, (block, inside) => {
      if (!teachersOf(block).length) return block;
      const remaining = inside
        .split(/[/;,]/u)
        .map((part) => part.trim())
        .filter((part) => !teachersOf(`(${part})`).length);
      return remaining.length ? `(${remaining.join('/')})` : '';
    })
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export function teacherChoices(lessons) {
  const names = new Map();
  for (const lesson of lessons) {
    for (const teacher of teachersOf(lesson.subject)) {
      const key = `${teacher.surname}|${teacher.initials}`;
      if (!names.has(key)) names.set(key, { value: key, label: teacher.name });
    }
  }
  return [...names.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'ru'),
  );
}

export function subjectWithTeachers(subject, names) {
  const title = withoutTeachers(subject);
  const selected = [...new Set(names.filter(Boolean))];
  return selected.length ? `${title} (${selected.join('/')})` : title;
}

export function filterTeacherGroups(groups, teacherKey) {
  if (!teacherKey) return groups;
  return groups
    .map((group) => ({
      ...group,
      lessons: group.lessons.map((slot) =>
        slot.filter((lesson) =>
          teachersOf(lesson.subject).some(
            (teacher) =>
              `${teacher.surname}|${teacher.initials}` === teacherKey,
          ),
        ),
      ),
    }))
    .filter((group) => group.lessons.some((slot) => slot.length));
}

export function filterTeacherGroupsByName(groups, query) {
  const normalizeName = (value) =>
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru')
      .replaceAll('ё', 'е')
      .replace(/[\s.]+/gu, '');
  const needle = normalizeName(query);
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      lessons: group.lessons.map((slot) =>
        slot.filter((lesson) =>
          teachersOf(lesson.subject).some((teacher) =>
            normalizeName(teacher.name).includes(needle),
          ),
        ),
      ),
    }))
    .filter((group) => group.lessons.some((slot) => slot.length));
}
