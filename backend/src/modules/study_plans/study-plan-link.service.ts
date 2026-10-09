import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

export function groupKey(name: string) {
  return name.normalize('NFKC').replace(/\s*\(\s*(?:9|11)\s*кл\.?\s*\)\s*$/iu, '')
    .replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '').toLocaleLowerCase('ru');
}

@Injectable()
export class StudyPlanLinkService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async link(body: unknown, actorId: string) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Ожидается объект');
    const input = body as Record<string, any>;
    const ids = input.assignmentIds ?? [input.assignmentId];
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2 || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
      throw new BadRequestException('Выберите одно назначение или две разные подгруппы');
    if (typeof input.lessonId !== 'string' || typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt)) || input.confirmed !== true)
      throw new BadRequestException('Подтвердите предмет, преподавателя и семестр');
    const rooms = input.rooms;
    if (ids.length === 2 && !rooms) throw new BadRequestException('При разделении укажите аудитории обеих подгрупп');
    if (rooms && (!Array.isArray(rooms) || rooms.length !== ids.length || rooms.some(room => typeof room !== 'string' || !room.trim())))
      throw new BadRequestException('Укажите аудиторию каждого занятия');
    try {
      return await this.prisma.$transaction(async tx => {
        const lesson = await tx.lesson.findUnique({ where: { id: input.lessonId } });
        if (!lesson) throw new NotFoundException('Занятие не найдено');
        if (+lesson.updatedAt !== Date.parse(input.updatedAt)) throw new ConflictException('Занятие изменилось. Обновите расписание.');
        const found = await tx.studyPlanAssignment.findMany({ where: { id: { in: ids } }, include: { studyPlan: { include: { group: true, subject: true } } } });
        const assignments = ids.map(id => found.find(item => item.id === id));
        if (assignments.some(item => !item)) throw new NotFoundException('Назначение РУП не найдено');
        const selected = assignments as NonNullable<typeof assignments[number]>[];
        const plan = selected[0].studyPlan;
        if (selected.some(a => a.studyPlanId !== plan.id)) throw new BadRequestException('Две подгруппы должны относиться к одному предмету и семестру');
        if (groupKey(lesson.groupName) !== groupKey(plan.group.name)) throw new BadRequestException('Группа занятия не совпадает с РУП');
        if (ids.length === 2 && (selected.some(a => !a.subgroupNumber) || selected[0].subgroupNumber === selected[1].subgroupNumber))
          throw new BadRequestException('Разделение разрешено только на две разные подгруппы');
        const year = plan.academicYear || plan.period.split(':')[0];
        const match = year.match(/^(\d{4})-(\d{4})$/);
        if (!match || +lesson.startsAt < +new Date(`${match[1]}-09-01T00:00:00+05:00`) || +lesson.startsAt >= +new Date(`${match[2]}-09-01T00:00:00+05:00`))
          throw new BadRequestException('Дата занятия не входит в учебный год РУП');
        const duplicates = await tx.lesson.findMany({ where: { id: { not: lesson.id }, groupName: lesson.groupName, startsAt: lesson.startsAt, assignmentId: { in: ids } } });
        if (duplicates.length) throw new ConflictException('Это назначение уже связано с другой карточкой этой пары');
        const before = { studyPlanId: lesson.studyPlanId, assignmentId: lesson.assignmentId, academicHours: lesson.academicHours, subject: lesson.subject, room: lesson.room };
        const results = [];
        for (const [index, assignment] of selected.entries()) {
          const data = {
            studyPlanId: plan.id, assignmentId: assignment.id, academicHours: 2,
            subject: `${plan.subject.name} (${assignment.teacherLabel})`,
            room: rooms?.[index]?.trim() ?? lesson.room,
          };
          results.push(index === 0
            ? await tx.lesson.update({ where: { id: lesson.id }, data })
            : await tx.lesson.create({ data: { ...data, groupName: lesson.groupName, startsAt: lesson.startsAt, endsAt: lesson.endsAt } }));
        }
        await tx.studyPlanChange.create({ data: {
          kind: 'lesson-link', targetId: lesson.id, actorId, before,
          after: { lessonIds: results.map(r => r.id), assignmentIds: ids, academicHours: 2, semester: plan.semester ?? Number(plan.period.split(':')[1]) },
        } });
        return { lessons: results };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Параллельное изменение. Обновите расписание.');
      throw error;
    }
  }
}
