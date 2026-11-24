import { Role } from './enums';

export interface UserProps {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: Role;
  department: string;
  position: string;
}

/** Публічне представлення користувача — без хешу пароля (FR-02). */
export type UserProfile = Omit<UserProps, 'passwordHash'>;

/**
 * Користувач системи (діаграма класів: User).
 * SRP: клас відповідає лише за дані користувача. Операції createBooking()/cancelBooking()
 * з діаграми винесено в BookingService, бо бронювання — окрема відповідальність.
 */
export class User {
  readonly id: string;
  fullName: string;
  readonly email: string;
  passwordHash: string;
  role: Role;
  department: string;
  position: string;

  constructor(props: UserProps) {
    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email.toLowerCase();
    this.passwordHash = props.passwordHash;
    this.role = props.role;
    this.department = props.department;
    this.position = props.position;
  }

  isAdmin(): boolean {
    return this.role === Role.ADMIN;
  }

  toProfile(): UserProfile {
    return {
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      role: this.role,
      department: this.department,
      position: this.position,
    };
  }
}
