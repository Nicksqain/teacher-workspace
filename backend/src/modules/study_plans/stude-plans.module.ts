import { Module } from "@nestjs/common";
import { StudyPlanController } from "./study-plans.controller";
import { StudyPlanService } from "./study-plans.service";
import { PrismaService } from "../../core/database/prisma.service";
import { StudyPlanExcelService } from "./study-plan-excel.service";

@Module({
    controllers: [StudyPlanController],
    providers: [StudyPlanService, PrismaService, StudyPlanExcelService],
    exports: [StudyPlanService]
})
export class StudyPlanModule {}