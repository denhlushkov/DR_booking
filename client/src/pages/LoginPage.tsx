import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/http';
import { useAuth } from '../context/AuthContext';

interface LoginForm {
  email: string;
  password: string;
}

/** FR-01: вхід за корпоративною поштою та паролем. */
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={redirectTo} replace />;

  const onSubmit = async ({ email, password }: LoginForm) => {
    setError(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Сервер недоступний, спробуйте пізніше');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit(onSubmit)} className="card w-full max-w-sm space-y-4" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Вхід до DR Booking</h1>
          <p className="text-sm text-slate-500">Використайте корпоративну пошту</p>
        </div>

        <label className="block">
          <span className="label">Електронна пошта</span>
          <input
            type="email"
            autoComplete="username"
            className="input"
            {...register('email', {
              required: 'Вкажіть електронну пошту',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Некоректна адреса' },
            })}
          />
          {errors.email && <span className="text-xs text-red-600">{errors.email.message}</span>}
        </label>

        <label className="block">
          <span className="label">Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            {...register('password', { required: 'Вкажіть пароль' })}
          />
          {errors.password && <span className="text-xs text-red-600">{errors.password.message}</span>}
        </label>

        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Вхід…' : 'Увійти'}
        </button>
      </form>
    </div>
  );
}
