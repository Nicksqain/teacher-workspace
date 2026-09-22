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
    ) {}

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