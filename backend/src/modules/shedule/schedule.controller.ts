import { ScheduleExcelService } from './schedule-excel.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ScheduleService } from "./schedule.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";


@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
    constructor(
        @Inject(ScheduleService)
        private readonly schedule: ScheduleService,
        @Inject(ScheduleExcelService) private readonly excel: ScheduleExcelService,
    ) {}

    @Post('excel/preview')
    @Roles('ADMIN')
    preview(@Body() body: unknown) { return this.excel.preview(body); }

    @Post('excel/import')
    @Roles('ADMIN')
    importExcel(@Body() body: unknown) { return this.excel.commit(body); }

    @Post('excel/export')
    exportExcel(@Body() body: unknown) { return this.excel.export(body); }

    @Get()
    findAll() {
        return this.schedule.findAll();
    }

    @Post()
    @Roles('ADMIN')
    create(@Body() body: unknown) {
        return this.schedule.create(body);
    }

    @Put(':id')
    @Roles('ADMIN')
    update(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body() body: unknown,
    ) {
        return this.schedule.update(id, body);
    }

    @Delete(':id')
    @Roles('ADMIN')
    remove(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.schedule.remove(id);
    }
} 