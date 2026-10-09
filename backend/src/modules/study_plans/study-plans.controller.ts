import { Body, Controller, Get, Inject, Post, Query, UseGuards, Param, ParseUUIDPipe, Req } from "@nestjs/common";
import { StudyPlanEditService } from './study-plan-edit.service';
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { StudyPlanService } from './study-plans.service';
import { StudyPlanExcelService } from "./study-plan-excel.service";
import { StudyPlanLinkService } from "./study-plan-link.service";


@Controller('study-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudyPlanController {
    constructor(
        @Inject(StudyPlanEditService) private readonly editor: StudyPlanEditService,
        @Inject(StudyPlanService)
        private readonly plans: StudyPlanService,
        @Inject(StudyPlanExcelService)
        private readonly excel: StudyPlanExcelService,
        @Inject(StudyPlanLinkService)
        private readonly linker: StudyPlanLinkService,
    ) {}

    @Get() 
    findAll(@Query('groupId') groupId?: string) {
        return this.plans.findAll(groupId);
    }

    @Get('semesters')
    semester() {
        return this.plans.semesters
    }

    @Post('link-lesson')
    @Roles('ADMIN')
    linkLesson(@Body() body: unknown, @Req() req: {user: {id: string}}) {
        return this.linker.link(body, req.user.id)
    }

    @Post('edit/:kind/:id')
    @Roles('ADMIN')
    edit(@Param('kind') kind: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: {user: {id: string}}) {
        return this.editor.update(kind, id, body, req.user.id);
    }

    @Get('history/:kind/:id')
    history(@Param('kind') kind: string, @Param('id', new ParseUUIDPipe()) id: string) {
        return this.editor.history(kind, id);
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
