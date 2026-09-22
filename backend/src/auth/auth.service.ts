import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../core/database/prisma.service";


@Injectable()
export class AuthService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,

        @Inject(JwtService)
        private readonly jwt: JwtService
    ) {}

    async login(email: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: {email},
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            throw new UnauthorizedException("Неверный email или пароль");
        }

        const accessToken = await this.jwt.signAsync({
            sub: user.id,
        });
        return {accessToken};
    }
}