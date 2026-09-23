import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();
async function main() {
  const source = JSON.parse(await readFile(new URL('../../frontend/pages/schedule/schedule-data.json', import.meta.url), 'utf8'));
  const existing = await prisma.lesson.findMany({ select: { groupName: true, startsAt: true } });
  const keys = new Set(existing.map((item) => `${item.groupName}|${item.startsAt.toISOString()}`));
  const data = [];
  for (const group of source.groups) {
    for (let index = 0; index < source.slots.length; index++) {
      const original = group.lessons[index];
      if (!original) continue;
      const [start, end] = source.slots[index].time.split('–').map((time: string) => time.padStart(5, '0'));
      const startsAt = new Date(`${source.date}T${start}:00+05:00`);
      const endsAt = new Date(`${source.date}T${end}:00+05:00`);
      if (keys.has(`${group.name}|${startsAt.toISOString()}`)) continue;
      const match = original.match(/\(([^()]*)\)\s*\/?\s*$/);
      const isRoom = match && /каб|площад|мастер|конференц|^\s*\d/i.test(match[1]);
      const room = isRoom ? match[1].trim() : 'Не указана';
      const subject = isRoom ? original.slice(0, match.index).trim() : original;
      const hash = createHash('sha256').update(`${source.source}|${group.id}|${index}`).digest('hex');
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
      data.push({ id, subject, groupName: group.name, room, startsAt, endsAt });
    }
  }
  const result = await prisma.lesson.createMany({ data, skipDuplicates: true });
  console.log(`Imported ${result.count} lessons. Existing lessons were not changed.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
