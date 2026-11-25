import { z } from 'zod';
import { ValidationError } from '../errors';

/** Валідує вхідні дані за zod-схемою; при помилці кидає ValidationError (HTTP 400). */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new ValidationError('Некоректні дані запиту', details);
  }
  return result.data;
}

const uuidSchema = z.uuid();

/** Ідентифікатор з параметрів маршруту (`/:id`). */
export function parseId(value: unknown): string {
  return parse(uuidSchema, value);
}
