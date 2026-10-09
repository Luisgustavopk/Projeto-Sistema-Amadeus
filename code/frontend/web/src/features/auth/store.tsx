import {
  createContext,
  useContext,
  useState,
  useCallback,
  type PropsWithChildren,
} from 'react';
function useCreateSession() {
  const [connected, setConnected] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const enter = useCallback(() => {
    setConnected(true);
    setStartedAt((previous) => previous || Date.now());
  }, []);
  const leave = useCallback(() => setConnected(false), []);
  return { connected, startedAt, enter, leave };
}
const Context = createContext<ReturnType<typeof useCreateSession> | null>(null);
/** Local preview session; it does not authenticate or store a server token. */
export function AuthProvider({ children }: PropsWithChildren) {
  const value = useCreateSession();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider ausente.');
  return value;
}
