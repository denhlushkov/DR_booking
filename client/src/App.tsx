import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ResourcesPage } from './pages/ResourcesPage';

// NFR-02: адмін-панель потрібна лише адміністраторам — завантажується окремим чанком.
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<ResourcesPage />} />
              <Route path="bookings" element={<MyBookingsPage />} />
              <Route element={<ProtectedRoute role="ADMIN" />}>
                <Route
                  path="admin"
                  element={
                    <Suspense fallback={<p className="text-slate-500">Завантаження…</p>}>
                      <AdminPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
