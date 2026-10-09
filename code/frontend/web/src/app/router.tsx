import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../features/auth/store';
import { LoginRoute } from '../routes/login';
import { IndexRoute } from '../routes/index';
import { IconLibrary } from '../assets/IconLibrary';
function SessionGuard() {
  const { connected } = useAuth();
  return connected ? <IndexRoute /> : <Navigate to="/login" replace />;
}
export function AppRouter() {
  return (
    <BrowserRouter>
      <IconLibrary />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<SessionGuard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
