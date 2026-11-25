import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ResourcesPage } from './pages/ResourcesPage';

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
                <Route path="admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
