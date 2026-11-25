import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`;

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-2 font-semibold text-indigo-700">DR Booking</span>
          <div className="ml-auto flex items-center gap-2 text-sm sm:order-last">
            <span className="hidden text-slate-600 md:inline">{user?.fullName}</span>
            <NotificationBell />
            <button type="button" className="btn-secondary" onClick={logout}>
              Вийти
            </button>
          </div>
          <nav className="-mx-1 flex w-full flex-wrap gap-1 sm:w-auto">
            <NavLink to="/" end className={linkClass}>
              Пошук місць
            </NavLink>
            <NavLink to="/bookings" className={linkClass}>
              Мої бронювання
            </NavLink>
            {user?.role === 'ADMIN' && (
              <NavLink to="/admin" className={linkClass}>
                Адміністрування
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
