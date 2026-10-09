import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store';
export function useLogin() {
  const session = useAuth();
  const navigate = useNavigate();
  return () => {
    session.enter();
    navigate('/', { replace: true });
  };
}
