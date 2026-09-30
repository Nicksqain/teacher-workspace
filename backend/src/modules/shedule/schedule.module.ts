import { ScheduleExcelService } from './schedule-excel.service';
import { Module } from "@nestjs/common";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";

@Module({
    controllers: [ScheduleController],
    providers: [ScheduleService, ScheduleExcelService]
})
export class ScheduleModule {}