import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACTIONS_KEY } from '../decorators/actions.decorator';

@Injectable()
export class ActionsGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredActions = this.reflector.getAllAndOverride<string[]>(ACTIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredActions || requiredActions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.permissions) {
      throw new ForbiddenException('Access denied: No permissions found');
    }

    // Проверяем, что у пользователя есть ВСЕ требуемые экшны (или изменить на .some для "хотя бы один")
    const userActions: string[] = user.permissions;
    const hasAllActions = requiredActions.every((action) => userActions.includes(action));

    if (!hasAllActions) {
      throw new ForbiddenException(`Access denied: Missing required action [${requiredActions.join(', ')}]`);
    }

    return true;
  }
}