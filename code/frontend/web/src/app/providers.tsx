import { useEffect, type PropsWithChildren } from 'react';
import { AuthProvider } from '../features/auth/store';
import { SettingsProvider } from '../features/settings/store';
import { ChatProvider } from '../features/chat/store';
import { AvatarProvider } from '../features/avatar/store';
import { I18nProvider } from '../i18n/provider';
import { NoticeProvider, useNotice } from '../hooks/useNotice';
function SessionProviders({ children }: PropsWithChildren) {
  const { notify } = useNotice();
  return (
    <AuthProvider>
      <SettingsProvider>
        <AvatarProvider>
          <ChatProvider notify={notify}>{children}</ChatProvider>
        </AvatarProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    document.body.dataset.theme = 'dark';
    return () => {
      delete document.body.dataset.theme;
    };
  }, []);
  return (
    <I18nProvider>
      <NoticeProvider>
        <SessionProviders>{children}</SessionProviders>
      </NoticeProvider>
    </I18nProvider>
  );
}
