import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ReactionKey } from './expressions';
const Context = createContext<{
  reaction: ReactionKey;
  setReaction: Dispatch<SetStateAction<ReactionKey>>;
} | null>(null);
export function AvatarProvider({ children }: PropsWithChildren) {
  const [reaction, setReaction] = useState<ReactionKey>('neutral');
  return (
    <Context.Provider value={{ reaction, setReaction }}>
      {children}
    </Context.Provider>
  );
}
export function useAvatarStore() {
  const value = useContext(Context);
  if (!value) throw new Error('AvatarProvider ausente.');
  return value;
}
