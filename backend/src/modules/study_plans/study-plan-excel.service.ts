import { BadRequestException, ConflictException,Inject,Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import ExcelJS from 'exceljs';

@Injectable()
export class StudyPlanExcelService {
  constructor(
    @Inject(PrismaService) 
    private readonly prisma: PrismaService
  ) {}
  async preview(body: unknown) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Ожидается объект с файлом');
    }

    const { file } = body as { file?: unknown };

    if (
      typeof file !== 'string' ||
      !file.length ||
      file.length > 5_600_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file)
    ) {
      throw new BadRequestException('Передайте .xlsx до 4 МБ в base64');
    }

    const buffer = Buffer.from(file, 'base64');

    if (buffer.length > 4 * 1024 * 1024) {
      throw new BadRequestException('Максимальный размер — 4 МБ');
    }

    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(
        buffer as unknown as ExcelJS.Buffer,
      );
    } catch {
      throw new BadRequestException('Не удалось прочитать Excel');
    }

    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw new BadRequestException('В файле нет листов');
    }

    // У объединённой ячейки берём значение главной ячейки.
    const text = (row: number, column: number) => {
      const cell = sheet.getCell(row, column);
      return (cell.isMerged ? cell.master : cell).text.trim();
    };

    // Проверяем формат именно предоставленного РУП.
    if (
      !/наименование предметов/i.test(text(8, 4)) ||
      !/1\s*семестр/i.test(text(8, 7)) ||
      !/2\s*семестр/i.test(text(8, 8))
    ) {
      throw new BadRequestException(
        'Ожидается РУП с предметами в D и семестрами в G–H',
      );
    }

    const yearMatch = text(6, 1).match(/(\d{4})\s*[-–—]\s*(\d{4})/);

    if (
      !yearMatch ||
      Number(yearMatch[2]) !== Number(yearMatch[1]) + 1
    ) {
      throw new BadRequestException('Не удалось определить учебный год');
    }

    const academicYear = `${yearMatch[1]}-${yearMatch[2]}`;

    const weeks = (column: number) => {
      const match = text(8, column).match(/(\d+)\s*нед/i);
      return match ? Number(match[1]) : null;
    };

    const hours = (row: number, column: number): number => {
      const value = text(row, column);

      if (!value || value === '-' || value === '—') return 0;

      const parsed = Number(value.replace(',', '.'));

      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new BadRequestException(
          `Строка ${row}, столбец ${column}: неверное количество часов`,
        );
      }

      return parsed;
    };

    const rows: Array<{
      sourceRow: number;
      groupName: string;
      subject: string;
      teacher: string;
      semester1Hours: number;
      semester2Hours: number;
      examHours: number;
      consultationHours: number;
      projectHours: number;
      warnings: string[];
    }> = [];

    let foundTotal = false;
    let currentGroup = '';

    for (let row = 12; row <= Math.min(sheet.rowCount, 2012); row++) {
      const subject = text(row, 4);

      if (/^итого(?:\s|:|$)/i.test(subject)) {
        foundTotal = true;
        break;
      }

      // The group is written once at the start of a block in this RUP.
      const explicitGroup = text(row, 2);
      if (explicitGroup) currentGroup = explicitGroup;

      const hasHours = [7, 8, 9, 10, 11].some(
        column => text(row, column),
      );

      if (!subject && !hasHours) continue;

      if (!subject) {
        throw new BadRequestException(
          `Строка ${row}: часы указаны без названия предмета`,
        );
      }

      const groupName = currentGroup;

      if (!groupName) {
        throw new BadRequestException(
          `Строка ${row}: не указана группа`,
        );
      }

      const teacher = text(row, 13);
      const warnings: string[] = [];

      if (!teacher || /ваканси/i.test(teacher)) {
        warnings.push('Нужно уточнить преподавателя');
      }

      rows.push({
        sourceRow: row,
        groupName,
        subject,
        teacher,
        semester1Hours: hours(row, 7),
        semester2Hours: hours(row, 8),
        examHours: hours(row, 9),
        consultationHours: hours(row, 10),
        projectHours: hours(row, 11),
        warnings,
      });
    }

    if (!rows.length || !foundTotal) {
      throw new BadRequestException(
        'Не найдены предметы или завершающая строка «итого»',
      );
    }

    const normalize = (value: string) =>
      value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');

    const counts = new Map<string, number>();

    for (const row of rows) {
      const key = JSON.stringify([
        normalize(row.groupName),
        normalize(row.subject),
      ]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const row of rows) {
      const key = JSON.stringify([
        normalize(row.groupName),
        normalize(row.subject),
      ]);

      if ((counts.get(key) ?? 0) > 1) {
        row.warnings.push(
          'Предмет повторяется: уточните подгруппы или распределение нагрузки',
        );
      }
    }

    return {
      academicYear,
      semesters: [
        { number: 1, weeks: weeks(7) },
        { number: 2, weeks: weeks(8) },
      ],
      requiresReview: rows.some(row => row.warnings.length > 0),
      rows,
    };
  }

  async importFile(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || (body as Record<string, unknown>).confirmed !== true) {
      throw new BadRequestException(
        `Проверьте предпросмотр и подвердите импорт`,
      );
    }

    const preview = await this.preview(body);


    type PreviewRow = (typeof preview.rows)[number];

    const normalize = (value: string ) => value.replace(/\s+/g, ' ').trim();

    const subjects = new Map<string, PreviewRow[]>();

    for (const row of preview.rows) {
      const key =  JSON.stringify([
        normalize(row.groupName).toLocaleLowerCase('ru'),
        normalize(row.subject).toLocaleLowerCase('ru'),
      ]);

      const items = subjects.get(key) ?? [];
      items.push(row);
      subjects.set(key, items);
    }

    for (const rows of subjects.values()) {
      if (rows.length > 2) {
        throw new BadRequestException(
          `${rows[0].subject}: найдено больше двух строк` +
        'Нужно уточнить распределение подгрупп',
        );
      }

      if (rows.length === 2 && normalize(rows[0].teacher).toLocaleLowerCase('ru') === normalize(rows[1].teacher).toLocaleLowerCase('ru')) {
        throw new BadRequestException(
          `${rows[0].subject}: повторяется один преподователь` + 
          'Проверьте строки файла'
        );
      }
    }

    try {
      return await this.prisma.$transaction(
        async tx => {
          let plansCreated = 0;
          let assignmentsCreated = 0;
          let annualHoursCreated = 0;

          for (const rows of subjects.values()) {
            const first  = rows[0];
            
            const group = await tx.studyGroup.upsert({
              where: {name: normalize(first.groupName)},
              update: {},
              create: {name: normalize(first.groupName)},
            });

            const subject  = await tx.subject.upsert({
              where: {name: normalize(first.subject)},
              update: {},
              create: {name: normalize(first.subject)}
            });

            const annualExisting = await tx.studyPlanAnnualHours.count({
              where: { groupId: group.id, subjectId: subject.id, academicYear: preview.academicYear },
            });
            if (annualExisting) throw new ConflictException(
              `${group.name}: ${subject.name} — годовые часы уже импортированы. Импорт отменён.`,
            );
            for (const [index, row] of rows.entries()) {
              await tx.studyPlanAnnualHours.create({ data: {
                groupId: group.id,
                subjectId: subject.id,
                academicYear: preview.academicYear,
                subgroupNumber: rows.length === 2 ? index + 1 : 0,
                teacherLabel: normalize(row.teacher),
                examHours: row.examHours,
                consultationHours: row.consultationHours,
                projectHours: row.projectHours,
              } });
              annualHoursCreated++;
            }

            for (const semester of preview.semesters) {
              const hours = rows.map(
                row => semester.number === 1
                  ? row.semester1Hours
                  : row.semester2Hours
              );

              const totalHours = Math.max(...hours);
              if (totalHours === 0) continue;

              const period = `${preview.academicYear}:${semester.number}`;
              const existing = await tx.studyPlan.findUnique({
                where: {
                  groupId_subjectId_period: {
                    groupId: group.id,
                    subjectId: subject.id,
                    period
                  },
                },
              });

              if (existing) {
                throw new ConflictException(
                  `${group.name}: ${subject.name}, ${period}` + 
                  'план уже существует. Импорт отменён'
                );
              }

              const plan = await tx.studyPlan.create({
                data: {
                  groupId: group.id,
                  subjectId: subject.id,
                  academicYear: preview.academicYear,
                  semester: semester.number,
                  weeks: semester.weeks,
                  period,
                  totalHours
                }
              });

              plansCreated++;

              for (const [index, row] of rows.entries()) {
                if (hours[index] === 0) continue;

                const subgroupNumber = rows.length === 2 ? index + 1 : 0;

                const subgroup = subgroupNumber
                  ? await tx.studySubgroup.upsert({
                    where: {
                      groupId_number: {
                        groupId: group.id,
                        number: subgroupNumber
                      },
                    },
                    update:{},
                    create: {
                      groupId: group.id,
                      number: subgroupNumber
                    }
                  })
                  : null;

                  await tx.studyPlanAssignment.create({
                    data: {
                      studyPlanId: plan.id,
                      subgroupNumber,
                      subgroupId: subgroup?.id ?? null,
                      teacherLabel: normalize(row.teacher),
                      totalHours: hours[index],
                      examHours: 0,
                      consultationHours: 0,
                      projectHours: 0,
                    }
                  });

                  assignmentsCreated++;
              }
            }
          }

          return {
            plansCreated,
            assignmentsCreated,
            annualHoursCreated,
            academicYear: preview.academicYear,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' || error.code === 'P2034') {
          throw new ConflictException(
            'Данные изменились параллельно.Обновите предпросмотр.',
          );
        }
      }
      throw error;
    }
  }

  annualHours(groupId?: string) {
    return this.prisma.studyPlanAnnualHours.findMany({
      where: groupId ? { groupId } : {},
      include: { group: true, subject: true },
      orderBy: [{ academicYear: 'asc' }, { subgroupNumber: 'asc' }],
    });
  }
}
