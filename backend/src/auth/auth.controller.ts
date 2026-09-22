import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller('auth')
export class AuthController {
    constructor(
        @Inject(AuthService)
        private readonly authService: AuthService
    ) {}

    @Post('login')
    @HttpCode(200)
    login(@Body() body: unknown) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new BadRequestException("Укажите свой email и пароль");
        }

        const { email,password } = body as Record<string, unknown>;

        if (
            typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password
        ) {
            throw new BadRequestException("Укажите email и пароль");
        }

        return this.authService.login(email.trim(), password);
    }
}