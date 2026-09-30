import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { StudyPlanService } from './study-plans.service';
import { StudyPlanExcelService } from "./study-plan-excel.service";


@Controller('study-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudyPlanController {
    constructor(
        @Inject(StudyPlanService)
        private readonly plans: StudyPlanService,
        @Inject(StudyPlanExcelService)
        private readonly excel: StudyPlanExcelService
    ) {}

    @Get() 
    findAll(@Query('groupId') groupId?: string) {
        return this.plans.findAll(groupId);
    }

    @Post('excel/preview')
    @Roles('ADMIN')
    previewExcel(@Body() body: unknown) {
        return this.excel.preview(body);
    }

    @Post('excel/import')
    @Roles('ADMIN')
    importExcel(@Body() body: unknown) {
        return this.excel.importFile(body);
    }

    @Post()
    @Roles('ADMIN')
    create(@Body() body: unknown) {
        return this.plans.create(body);
    }

    @Get('annual-hours')
    annualHours(@Query('groupId') groupId?: string) {
        return this.excel.annualHours(groupId);
    }
}
