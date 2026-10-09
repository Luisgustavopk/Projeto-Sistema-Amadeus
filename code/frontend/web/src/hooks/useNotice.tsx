import { createContext, useContext, type PropsWithChildren } from 'react';
import { useNotifications } from './useNotifications';
const Context = createContext<ReturnType<typeof useNotifications> | null>(null);
export function useNotice() {
  const value = useContext(Context);
  if (!value) throw new Error('NoticeProvider ausente.');
  return value;
}
export function NoticeProvider({ children }: PropsWithChildren) {
  const value = useNotifications();
  return (
    <Context.Provider value={value}>
      {children}
      <div id="toast" className="toast" role="status" hidden={!value.message}>
        {value.message}
      </div>
    </Context.Provider>
  );
}
