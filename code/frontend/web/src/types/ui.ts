import type { ReactNode } from 'react';
export type Notify = (message: string) => void;
export type DialogName = 'chat' | 'history' | 'avatar' | 'settings' | 'system';
export type OpenPanel = (name: DialogName) => void;
export interface PanelProps {
  open: boolean;
  onClose: () => void;
}
export interface ConsolePanelProps extends PanelProps {
  id: string;
  code: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
}
