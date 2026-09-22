import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../core/database/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany();
  }
}
