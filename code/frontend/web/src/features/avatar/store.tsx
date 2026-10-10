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
  arms: boolean;
  setArms: Dispatch<SetStateAction<boolean>>;
  actingEvent: { intent: string; emotion: string; intensity: number } | null;
  setActingEvent: Dispatch<
    SetStateAction<{
      intent: string;
      emotion: string;
      intensity: number;
    } | null>
  >;
} | null>(null);
export function AvatarProvider({ children }: PropsWithChildren) {
  const [reaction, setReaction] = useState<ReactionKey>('neutral');
  const [arms, setArms] = useState(false);
  const [actingEvent, setActingEvent] = useState<{
    intent: string;
    emotion: string;
    intensity: number;
  } | null>(null);
  return (
    <Context.Provider
      value={{
        reaction,
        setReaction,
        arms,
        setArms,
        actingEvent,
        setActingEvent,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAvatarStore() {
  const value = useContext(Context);
  if (!value) throw new Error('AvatarProvider ausente.');
  return value;
}
