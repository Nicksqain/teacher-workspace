import 'reflect-metadata';
import { vi, describe, it, expect } from 'vitest';
import { StudyPlanExcelService } from './study-plan-excel.service';
import type { PrismaService } from '../../core/database/prisma.service';

function setup() {
  const annual: any[] = [];
  const assignments: any[] = [];
  const tx = {
    studyGroup: { upsert: async () => ({ id: 'g', name: 'Group' }) },
    subject: { upsert: async () => ({ id: 's', name: 'Subject' }) },
    studySubgroup: { upsert: async ({ create }: any) => ({ id: `sub-${create.number}` }) },
    studyPlanAnnualHours: {
      count: async () => annual.length,
      create: async ({ data }: any) => { annual.push(data); return data; },
    },
    studyPlan: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ ...data, id: `plan-${data.semester}` }),
    },
    studyPlanAssignment: {
      create: async ({ data }: any) => { assignments.push(data); return data; },
    },
  };
  const transaction = vi.fn(async (run: any) => run(tx));
  const service = new StudyPlanExcelService({ $transaction: transaction } as unknown as PrismaService);
  const row = {
    sourceRow: 12, groupName: 'Group', subject: 'Subject', teacher: 'Teacher 1',
    semester1Hours: 38, semester2Hours: 58, examHours: 3,
    consultationHours: 3, projectHours: 0, warnings: [],
  };
  const preview = { academicYear: '2026-2027', semesters: [{ number: 1, weeks: 17 }, { number: 2, weeks: 19 }], requiresReview: true,
    rows: [row, { ...row, sourceRow: 13, teacher: 'Teacher 2' }],
  };
  vi.spyOn(service, 'preview').mockResolvedValue(preview);
  return { service, annual, assignments, transaction, preview };
}

describe('RUP annual hours import', () => {
  it('keeps each subgroup annual load once, outside both semester assignments', async () => {
    const { service, annual, assignments } = setup();
    const result = await service.importFile({ confirmed: true });
    expect(result).toMatchObject({ plansCreated: 2, assignmentsCreated: 4, annualHoursCreated: 2 });
    expect(annual.map(r => r.subgroupNumber)).toEqual([1, 2]);
    expect(annual.map(r => r.examHours)).toEqual([3, 3]);
    expect(annual.map(r => r.consultationHours)).toEqual([3, 3]);
    expect(assignments.map(r => r.totalHours)).toEqual([38, 38, 58, 58]);
    expect(assignments.every(r => r.examHours === 0 && r.consultationHours === 0)).toBe(true);
  });

  it('retains annual-only hours when no semester has lessons', async () => {
    const { service, preview, annual, assignments } = setup();
    preview.rows = [{ ...preview.rows[0], semester1Hours: 0, semester2Hours: 0, projectHours: 4 }];
    await service.importFile({ confirmed: true });
    expect(annual[0]).toMatchObject({ subgroupNumber: 0, examHours: 3, projectHours: 4 });
    expect(assignments).toHaveLength(0);
  });

  it('requires explicit confirmation before opening a transaction', async () => {
    const { service, transaction } = setup();
    for (const confirmed of [undefined, false, 'true']) {
      await expect(service.importFile({ confirmed })).rejects.toThrow();
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects repeat imports without adding annual records', async () => {
    const { service, annual } = setup();
    await service.importFile({ confirmed: true });
    await expect(service.importFile({ confirmed: true })).rejects.toThrow('уже импортированы');
    expect(annual).toHaveLength(2);
  });
});
