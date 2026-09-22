import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../core/database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { group } from "node:console";


function parseLesson(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new BadRequestException("Ожидается обьект занятия");
    }

    const input = body as Record<string, unknown>;

    function text(field: string) {
        const value = input[field];

        if (typeof value !== 'string' || !value.trim()) {
            throw new BadRequestException(`Заполните поле ${field}`);
        }

        return value.trim();
    }

    function date (field: string) {
        const value = text(field);

        if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
            throw new BadRequestException(`{field}: укажите дату и время с часовым поясом`);
        }

        const result = new Date(value);

        if (Number.isNaN(result.getTime())) {
            throw new BadRequestException(`Некорректная дата: ${field}`);
        }

        return result;
    }

    const startsAt = date('startsAt');
    const endsAt = date('endsAt');

    if (endsAt <= startsAt) {
        throw new BadRequestException("Окончвние должны быть позже начала");
    }

    return {
        subject: text('subject'),
        groupName: text('groupName'),
        room: text('room'),
        startsAt,
        endsAt
    };
}

@Injectable()
export class ScheduleService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) {}

    findAll() {
        return this.prisma.lesson.findMany({
            orderBy: {startsAt: 'asc'},
        });
    }

    create(body: unknown) {
        return this.prisma.lesson.create({
            data: parseLesson(body),
        });
    }

    async update (id:string, body: unknown) {
        const data = parseLesson(body);

        try {
            return await this.prisma.lesson.update({
                where: {id},
                data,
            });
        } catch(e) {
            this.handleError(e);
        }
    }

    async remove(id:string) {
        try {
            return await this.prisma.lesson.delete({
                where: {id}
            });
        } catch (e) {
            this.handleError(e);
        }
    }

    private handleError(error: unknown): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        )  {
            throw new NotFoundException("Занятие не найдено");
        }

        throw error;
    } 
}