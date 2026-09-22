import { Controller, Delete, Get, Inject, Post, UseGuards } from "@nestjs/common";

import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RequireActions } from "../../auth/decorators/actions.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { ActionsGuard } from "../../auth/guards/actions.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) { }

  // Проверка ТОЛЬКО ПО РОЛИ
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.usersService.findAll();
  }
  // Проверка ТОЛЬКО ПО ЭКШНУ
  // @Post()
  // @UseGuards(ActionsGuard)
  // @RequireActions('users:view')
  // findAll() {
  //   return this.usersService.findAll();
  // }
  
  // Совместная проверка: РОЛЬ + ЭКШН
  // @Delete(':id')
  // @UseGuards(RolesGuard, ActionsGuard)
  // @Roles('TEACHER', 'ADMIN')
  // @RequireActions('users:view')
  //  findAll() {
  //   return this.usersService.findAll();
  // }
}
