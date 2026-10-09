import { createContext, useContext, type PropsWithChildren } from 'react';
import pt from './pt-BR.json';
import en from './en.json';
import ja from './ja.json';
const dictionaries = { 'pt-BR': pt, en, ja };
export type Locale = keyof typeof dictionaries;
const Context = createContext(dictionaries['pt-BR']);
export function I18nProvider({
  children,
  locale = 'pt-BR',
}: PropsWithChildren<{ locale?: Locale }>) {
  return (
    <Context.Provider value={dictionaries[locale]}>{children}</Context.Provider>
  );
}
export function useI18n() {
  const dictionary = useContext(Context);
  return (key: keyof typeof pt) => dictionary[key];
}
