import { randomUUID } from 'node:crypto';
import { ResourceStatus, ResourceType, Role } from '../domain/enums';
import { Resource, type ResourceAttributes } from '../domain/resource';
import { User } from '../domain/user';
import type { Repositories } from '../container';
import type { IPasswordHasher } from '../modules/auth/password-hasher';

/** Облікові записи для локальної демонстрації. НЕ використовувати в production. */
export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@company.com', password: 'Admin12345' },
  employee: { email: 'employee@company.com', password: 'Employee12345' },
} as const;

const DEMO_RESOURCES: Array<{ name: string; type: ResourceType; floor: number; attributes: ResourceAttributes }> = [
  { name: 'Стіл A-101', type: ResourceType.DESK, floor: 1, attributes: { zone: 'Open Space A', equipment: ['monitor', 'docking'] } },
  { name: 'Стіл A-102', type: ResourceType.DESK, floor: 1, attributes: { zone: 'Open Space A', equipment: ['monitor'] } },
  { name: 'Стіл B-201', type: ResourceType.DESK, floor: 2, attributes: { zone: 'Quiet Zone B', equipment: [] } },
  { name: 'Переговорна «Київ»', type: ResourceType.MEETING_ROOM, floor: 1, attributes: { zone: 'Open Space A', capacity: 8, equipment: ['tv', 'whiteboard'] } },
  { name: 'Переговорна «Львів»', type: ResourceType.MEETING_ROOM, floor: 2, attributes: { zone: 'Quiet Zone B', capacity: 4, equipment: ['videoconference'] } },
];

/** Ідемпотентне наповнення: нічого не робить, якщо адміністратор уже існує. */
export async function seedDemoData(repos: Repositories, hasher: IPasswordHasher): Promise<void> {
  if (await repos.users.findByEmail(DEMO_ACCOUNTS.admin.email)) return;

  await repos.users.insert(
    new User({
      id: randomUUID(),
      fullName: 'Адміністратор Офісу',
      email: DEMO_ACCOUNTS.admin.email,
      passwordHash: await hasher.hash(DEMO_ACCOUNTS.admin.password),
      role: Role.ADMIN,
      department: 'Адміністрація',
      position: 'Офіс-менеджер',
    }),
  );
  await repos.users.insert(
    new User({
      id: randomUUID(),
      fullName: 'Тестовий Співробітник',
      email: DEMO_ACCOUNTS.employee.email,
      passwordHash: await hasher.hash(DEMO_ACCOUNTS.employee.password),
      role: Role.EMPLOYEE,
      department: 'Розробка',
      position: 'Software Engineer',
    }),
  );
  for (const r of DEMO_RESOURCES) {
    await repos.resources.insert(new Resource({ id: randomUUID(), status: ResourceStatus.AVAILABLE, ...r }));
  }
  console.info(`[seed] Демо-дані створено. Адмін: ${DEMO_ACCOUNTS.admin.email}`);
}
