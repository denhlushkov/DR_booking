import type { Role } from '../domain/enums';

/** Автентифікований користувач, від імені якого виконується дія. */
export interface Actor {
  id: string;
  role: Role;
}

/** Генератор ідентифікаторів; за замовчуванням — crypto.randomUUID. */
export type IdGenerator = () => string;
