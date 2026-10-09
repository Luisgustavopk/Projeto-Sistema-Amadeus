import { useRef, useEffect } from 'react';
import { LoginScreen } from '../features/auth/components/LoginScreen';
import { useLogin } from '../features/auth/hooks/useLogin';
import { useAuth } from '../features/auth/store';
export function LoginRoute() {
  const enterRef = useRef<HTMLButtonElement>(null);
  const enter = useLogin();
  const { startedAt } = useAuth();
  useEffect(() => {
    if (startedAt) enterRef.current?.focus();
  }, [startedAt]);
  return <LoginScreen visible onEnter={enter} enterRef={enterRef} />;
}
