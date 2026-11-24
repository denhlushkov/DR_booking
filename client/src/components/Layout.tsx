import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`;

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-4 font-semibold text-indigo-700">DR Booking</span>
          <nav className="flex flex-wrap gap-1">
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
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user?.fullName}</span>
            <button type="button" className="btn-secondary" onClick={logout}>
              Вийти
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
