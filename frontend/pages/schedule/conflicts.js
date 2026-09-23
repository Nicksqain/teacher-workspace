const normalize = (value) =>
  value.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е');

export function teachersOf(subject = '') {
  const result = [];
  for (const match of subject.matchAll(/\(([^()]*)\)/gu)) {
    for (const part of match[1].split(/[/;,]/u)) {
      const name = part.trim();
      const full = name.match(
        /^([\p{L}][\p{L}-]+)\s+((?:\p{L}\s*\.\s*){1,3})$/u,
      );
      if (full) {
        result.push({
          name,
          surname: normalize(full[1]),
          initials: normalize(full[2]).replace(/[^\p{L}]/gu, ''),
        });
      } else if (/^\p{Lu}[\p{L}-]+$/u.test(name)) {
        result.push({ name, surname: normalize(name), initials: '' });
      }
    }
  }
  return result;
}

export function roomsOf(room = '') {
  return room
    .split(/[/;,]/u)
    .map((name) => {
      let key = normalize(name)
        .replace(/кабинет(?:ы)?|аудитори[яи]|каб\.?|ауд\.?|№/gu, '')
        .replace(/[\s.()]/gu, '');
      key = key.replace(/^0+(?=\d)/u, '').replace(/(?<=\d)a$/u, 'а');
      if (!key || ['неуказана', 'нет', '-', '—'].includes(key)) return null;
      return { key, name: name.trim() };
    })
    .filter(Boolean);
}

export function findConflicts(lessons) {
  const result = new Map(lessons.map((lesson) => [lesson.id, []]));
  const prepared = lessons.map((lesson) => ({
    lesson,
    start: Date.parse(lesson.startsAt),
    end: Date.parse(lesson.endsAt),
    teachers: teachersOf(lesson.subject),
    rooms: roomsOf(lesson.room),
  }));
  const add = (a, b, type, name, possible = false) => {
    result
      .get(a.lesson.id)
      .push({
        type,
        name,
        possible,
        peerId: b.lesson.id,
        groupName: b.lesson.groupName,
        startsAt: b.lesson.startsAt,
        endsAt: b.lesson.endsAt,
      });
    result
      .get(b.lesson.id)
      .push({
        type,
        name,
        possible,
        peerId: a.lesson.id,
        groupName: a.lesson.groupName,
        startsAt: a.lesson.startsAt,
        endsAt: a.lesson.endsAt,
      });
  };
  for (let i = 0; i < prepared.length; i++) {
    const a = prepared[i];
    if (!(a.start < a.end)) continue;
    for (let j = i + 1; j < prepared.length; j++) {
      const b = prepared[j];
      if (
        a.lesson.id === b.lesson.id ||
        !(b.start < b.end) ||
        !(a.start < b.end && b.start < a.end)
      )
        continue;
      const seen = new Set();
      if (
        normalize(a.lesson.groupName.trim()) !==
        normalize(b.lesson.groupName.trim())
      ) {
        for (const x of a.teachers)
          for (const y of b.teachers) {
            if (x.surname !== y.surname) continue;
            if (
              x.initials &&
              y.initials &&
              !x.initials.startsWith(y.initials) &&
              !y.initials.startsWith(x.initials)
            )
              continue;
            const key = `teacher:${x.surname}:${x.initials || y.initials}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const possible =
              !x.initials || !y.initials || x.initials !== y.initials;
            add(
              a,
              b,
              'teacher',
              x.initials.length >= y.initials.length ? x.name : y.name,
              possible,
            );
          }
      }
      for (const x of a.rooms)
        for (const y of b.rooms) {
          if (x.key !== y.key || seen.has(`room:${x.key}`)) continue;
          seen.add(`room:${x.key}`);
          add(a, b, 'room', x.name);
        }
    }
  }
  return result;
}

export function conflictText(conflict) {
  const time = (value) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Qyzylorda',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  const label =
    conflict.type === 'teacher'
      ? `${conflict.possible ? 'Возможно, преподаватель' : 'Преподаватель'} ${conflict.name}`
      : `Кабинет / место ${conflict.name}`;
  return `${label} — также ${conflict.groupName}, ${time(conflict.startsAt)}–${time(conflict.endsAt)}`;
}
