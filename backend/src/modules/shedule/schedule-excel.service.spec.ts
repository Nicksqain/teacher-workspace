import 'reflect-metadata';
import ExcelJS from 'exceljs';
import { parseWorkbook, ScheduleExcelService } from './schedule-excel.service';
import type { PrismaService } from '../../core/database/prisma.service';

async function file(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Занятия');
  sheet.addRow(['Группа', 'Предмет', 'Кабинет', 'Начало (ISO)', 'Окончание (ISO)']);
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}

const lesson = ['ПР-1-24', 'Математика', '12', '2026-09-22T08:30:00+05:00', '2026-09-22T09:50:00+05:00'];

describe('Excel schedule import', () => {
  it('returns saved lessons immediately and supports reapplying an unchanged file', async () => {
    const saved: any[] = [];
    const repository = {
      findMany: async () => [...saved],
      create: async ({ data }: any) => {
        const row = { ...data, id: 'saved-lesson', updatedAt: new Date() };
        saved.push(row);
        return row;
      },
    };
    const service = new ScheduleExcelService({
      lesson: repository,
      $transaction: async (run: any) => run({ lesson: repository }),
    } as unknown as PrismaService);
    const request = { date: '2026-09-22', file: await file([lesson]) };
    const preview = await service.preview(request);
    const result = await service.commit({ ...request, fingerprint: preview.fingerprint });
    expect(result).toMatchObject({ date: request.date, create: 1, lessons: [{ id: 'saved-lesson', subject: 'Математика' }] });
    const again = await service.preview(request);
    const unchanged = await service.commit({ ...request, fingerprint: again.fingerprint });
    expect(unchanged).toMatchObject({ create: 0, skip: 1, lessons: [{ id: 'saved-lesson' }] });
    expect(saved).toHaveLength(1);
  });

  it('reads lessons and ignores empty rows', async () => {
    const rows = await parseWorkbook(await file([lesson, []]), '2026-09-22');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ groupName: 'ПР-1-24', subject: 'Математика', room: '12' });
    expect(rows[0].startsAt.toISOString()).toBe('2026-09-22T03:30:00.000Z');
  });

  it('rejects another date and duplicate group/time before saving', async () => {
    await expect(parseWorkbook(await file([lesson]), '2026-09-23')).rejects.toThrow('Дата занятий');
    await expect(parseWorkbook(await file([lesson, lesson]), '2026-09-22')).rejects.toThrow('повторяется группа');
  });

  it('reads the grid format with time and room', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расписание');
    sheet.getCell('D3').value = 'ПР-1-24';
    sheet.getCell('C4').value = '8:30–9:50';
    sheet.getCell('D4').value = 'Математика (12 каб)';
    const rows = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), '2026-09-22');
    expect(rows[0]).toMatchObject({ subject: 'Математика', room: '12 каб' });
  });

  it('rejects invalid dates as a validation error', async () => {
    const service = new ScheduleExcelService({} as PrismaService);
    await expect(service.preview({ date: '2026-99-99' })).rejects.toThrow('Укажите корректную дату');
  });

  it('ignores distant empty formatted cells when importing September 30', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расписание');
    sheet.getCell('D3').value = 'ПР-1-24';
    sheet.getCell('C4').value = '8:30–9:50';
    sheet.getCell('D4').value = 'Математика (12 каб)';
    sheet.getCell('ZZ5000').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const rows = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), '2026-09-30');
    expect(rows).toHaveLength(1);
    expect(rows[0].startsAt.toISOString()).toBe('2026-09-30T03:30:00.000Z');
  });

  it('ignores formatted empty rows in the exported lesson list', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Занятия');
    sheet.addRow(['Группа', 'Предмет', 'Кабинет', 'Начало (ISO)', 'Окончание (ISO)']);
    sheet.addRow(lesson);
    sheet.getCell('A5000').font = { bold: true };
    expect(await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), '2026-09-22')).toHaveLength(1);
  });
});
