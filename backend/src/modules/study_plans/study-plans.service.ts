import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { error, group } from "node:console";


@Injectable()
export class StudyPlanService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService
    ) {}

    async findAll(groupId?: string) {
        const plans = await this.prisma.studyPlan.findMany({
            where: groupId ? { groupId } : {},
            include: {
                group: true,
                subject: true,
                lessons: {
                    where: {assignmentId: null},
                    select: { id: true}
                },

                assignments: {
                    orderBy: {subgroupNumber: "asc"},

                    include: {
                        teacher: true,
                        subgroup: true,

                        lessons: {
                            select: {academicHours: true}
                        }
                    }
                }
            },
            orderBy: { period: 'asc' }
        });

       return plans.map(({assignments, lessons, ...plan}) => {
          const assignmentsWithHours = assignments.map(
            ({lessons: assignmentLessons, ...assignment}) => {
                const plannedHours = assignmentLessons.reduce(
                    (sum, lessons) => sum + (lessons.academicHours ?? 0),
                    0
                );

                const uncountedLessons = assignmentLessons.filter(
                    lesson => lesson.academicHours === null
                ).length;

                return {
                    ...assignment,
                    plannedHours,
                    remainingHours: assignment.totalHours - plannedHours,
                    uncountedLessons,
                };
            },
        );

        return {
            ...plan,
            unassignedLessons: lessons.length,
            assignments: assignmentsWithHours
        };
       });
    }

    async create(body: unknown) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new BadRequestException(`Ожидается обьекта учебного плана`);
        }

        const input = body as Record<string, unknown>;

        function requiredText(field: string): string {
            const value = input[field];
            
            if (typeof value !== 'string' || !value.trim()) {
                throw new BadRequestException(`Заполните поля ${field}`);
            }

            return value.trim();
        }

        const groupId = requiredText('groupId');
        const subjectId = requiredText('subjectId');
        const period = requiredText('period');

        if (!/^\d{4}-\d{4}:[12]$/.test(period)) {
            throw new BadRequestException(
                'Период должен иметь формат 2026-2027:1'
            );
        }

        const [startYear, endYear] = period.split(':')[0].split('-').map(Number);

        if (endYear !== startYear + 1) {
            throw new BadRequestException('Некорректный учебный год');
        }

        const totalHours = input.totalHours;
        if (typeof totalHours !== 'number' || !Number.isSafeInteger(totalHours) || totalHours <= 0) {
            throw new BadRequestException(
                'Количество часов должно быть положительным целым числом',
            );
        }

        try {
            return await this.prisma.studyPlan.create({
                data: {
                    groupId,
                    subjectId,
                    period,
                    totalHours
                },
                include: {
                    group: true,
                    subject: true
                }
            });
        } catch(e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code == 'P2002') {
                    throw new ConflictException(
                        'Для группы и предмета уже есть план на этот семестер',
                    );
                }

                if (e.code == 'P2003') {
                    throw new BadRequestException(
                        'Указанная группа или предмет не существуют'
                    );
                }
            }

            throw error;
        }
    }
}