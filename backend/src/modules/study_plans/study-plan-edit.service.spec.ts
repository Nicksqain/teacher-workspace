import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { StudyPlanEditService } from './study-plan-edit.service';
import type { PrismaService } from '../../core/database/prisma.service';

function setup() {
  const row = { id: 'a', studyPlanId: 'p', teacherLabel: 'Teacher', totalHours: 40, lessons: [{ academicHours: 12 }] };
  const tx = {
    studyPlanAssignment: { findUnique: vi.fn(async () => row), update: vi.fn(async () => ({})), aggregate: vi.fn(async () => ({ _max: { totalHours: 30 } })) },
    studyPlanAnnualHours: { findUnique: vi.fn(async () => ({ teacherLabel: 'Teacher', examHours: 3, consultationHours: 3, projectHours: 0 })), update: vi.fn(async () => ({})) },
    studyPlan: { update: vi.fn(async () => ({})) },
    studyPlanChange: { create: vi.fn(async () => ({})) },
  };
  const service = new StudyPlanEditService({ $transaction: (fn: any) => fn(tx) } as unknown as PrismaService);
  return { service, tx, original: { teacherLabel: 'Teacher', totalHours: 40 } };
}
describe('Study plan editing', () => {
  it('updates hours and records before/after without changing lessons', async () => {
    const { service, tx, original } = setup();
    await service.update('assignment', 'a', { original, teacherLabel: 'New teacher', totalHours: 30 }, 'actor');
    expect(tx.studyPlanAssignment.update).toHaveBeenCalledWith({where:{id:'a'},data:{teacherLabel:'New teacher',totalHours:30,teacherId:null}});
    expect(tx.studyPlanChange.create).toHaveBeenCalledWith({ data: { kind: 'assignment', targetId: 'a', actorId: 'actor', before: original, after: {teacherLabel:'New teacher',totalHours:30} } });
  });
  it('requires confirmation for overload', async () => {
    const { service, tx, original } = setup();
    const input = { original, teacherLabel: 'Teacher', totalHours: 10 };
    await expect(service.update('assignment','a',input,'actor')).rejects.toThrow('Запланировано 12');
    expect(tx.studyPlanAssignment.update).not.toHaveBeenCalled();
    await expect(service.update('assignment','a',{...input,allowOverload:true},'actor')).resolves.toMatchObject({changed:true});
  });
  it('rejects stale edits and invalid hours', async () => {
    const { service, original, tx } = setup();
    await expect(service.update('assignment','a',{original:{...original,totalHours:41},teacherLabel:'Teacher',totalHours:30},'actor')).rejects.toThrow('другим пользователем');
    await expect(service.update('assignment','a',{original,teacherLabel:'Teacher',totalHours:-1},'actor')).rejects.toThrow('Часы');
    expect(tx.studyPlanChange.create).not.toHaveBeenCalled();
  });
  it('edits annual hours independently of semester plans', async () => {
    const { service, tx } = setup();
    await service.update('annual','a',{original:{teacherLabel:'Teacher',examHours:3,consultationHours:3,projectHours:0},teacherLabel:'Teacher',examHours:6,consultationHours:3,projectHours:0},'actor');
    expect(tx.studyPlanAnnualHours.update).toHaveBeenCalled();
    expect(tx.studyPlan.update).not.toHaveBeenCalled();
    expect(tx.studyPlanChange.create).toHaveBeenCalled();
  });
});
