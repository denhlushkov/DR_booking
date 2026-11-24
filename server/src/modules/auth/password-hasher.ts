import { compare, hash } from 'bcryptjs';

/** Абстракція хешування паролів (ISP: лише дві операції, потрібні клієнтам). */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, passwordHash: string): Promise<boolean>;
}

/** NFR-04: паролі зберігаються лише у вигляді bcrypt-хешу. */
export class BcryptPasswordHasher implements IPasswordHasher {
  constructor(private readonly rounds = 10) {}

  hash(plain: string): Promise<string> {
    return hash(plain, this.rounds);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }
}
