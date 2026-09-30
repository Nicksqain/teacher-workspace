import { Module } from "@nestjs/common";

import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./core/database/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ScheduleModule } from "./modules/shedule/schedule.module";
import { StudyPlanModule } from "./modules/study_plans/stude-plans.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ScheduleModule,
    StudyPlanModule
  ],
  controllers: [
    AppController,
  ],
  providers: [
  ],
})
export class AppModule { }
