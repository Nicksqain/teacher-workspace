import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

function fields(kind: string) {
  if (kind === 'assignment') return ['teacherLabel', 'totalHours'];
  if (kind === 'annual') return ['teacherLabel', 'examHours', 'consultationHours', 'projectHours'];
  throw new BadRequestException('Неизвестный тип записи');
}

@Injectable()
export class StudyPlanEditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  history(kind: string, targetId: string) {
    fields(kind);
    return this.prisma.studyPlanChange.findMany({ where: { kind, targetId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async update(kind: string, id: string, body: unknown, actorId: string) {
    const keys = fields(kind);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Ожидается объект');
    const input = body as Record<string, any>;
    if (!input.original || typeof input.original !== 'object') throw new BadRequestException('Обновите страницу перед редактированием');
    const data: Record<string, string | number> = {};
    for (const key of keys) {
      const value = input[key];
      if (key === 'teacherLabel') {
        if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new BadRequestException('Укажите преподавателя или «Вакансия»');
        data[key] = value.trim();
      } else {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) throw new BadRequestException('Часы должны быть целым числом от 0 до 10000');
        data[key] = value;
      }
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const current = kind === 'assignment'
          ? await tx.studyPlanAssignment.findUnique({ where: { id }, include: { lessons: { select: { academicHours: true } } } })
          : await tx.studyPlanAnnualHours.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Запись не найдена');
        const before = Object.fromEntries(keys.map(key => [key, (current as any)[key]]));
        if (keys.some(key => input.original[key] !== before[key])) throw new ConflictException('Запись изменена другим пользователем. Обновите страницу.');
        let plannedHours = 0;
        if ('lessons' in current) {
          plannedHours = current.lessons.reduce((sum, lesson) => sum + (lesson.academicHours ?? 0), 0);
          if (Number(data.totalHours) < plannedHours && input.allowOverload !== true) throw new ConflictException(`Запланировано ${plannedHours} ч. Подтвердите сохранение превышения.`);
        }
        if (keys.every(key => data[key] === before[key])) return { plannedHours, changed: false };
        if (kind === 'assignment' && 'studyPlanId' in current) {
          await tx.studyPlanAssignment.update({ where: { id }, data: {
            teacherLabel: String(data.teacherLabel), totalHours: Number(data.totalHours),
            ...(data.teacherLabel !== before.teacherLabel ? { teacherId: null } : {}),
          } });
          const totals = await tx.studyPlanAssignment.aggregate({ where: { studyPlanId: current.studyPlanId }, _max: { totalHours: true } });
          await tx.studyPlan.update({ where: { id: current.studyPlanId }, data: { totalHours: totals._max.totalHours ?? 0 } });
        } else {
          await tx.studyPlanAnnualHours.update({ where: { id }, data: {
            teacherLabel: String(data.teacherLabel), examHours: Number(data.examHours),
            consultationHours: Number(data.consultationHours), projectHours: Number(data.projectHours),
          } });
        }
        await tx.studyPlanChange.create({ data: { kind, targetId: id, actorId, before, after: data } });
        return { plannedHours, changed: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Параллельное изменение. Обновите страницу и повторите.');
      throw error;
    }
  }
}
