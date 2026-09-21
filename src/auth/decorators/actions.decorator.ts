import { SetMetadata } from '@nestjs/common';

export const ACTIONS_KEY = 'actions';
export const RequireActions = (...actions: string[]) => SetMetadata(ACTIONS_KEY, actions);