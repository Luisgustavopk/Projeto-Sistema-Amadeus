import type { Ref } from 'react';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../i18n/provider';
/** Entry control for the visual preview; credentials are not requested. */
export function LoginForm({
  onEnter,
  enterRef,
}: {
  onEnter: () => void;
  enterRef: Ref<HTMLButtonElement>;
}) {
  const t = useI18n();
  return (
    <Button
      id="enter"
      ref={enterRef}
      onClick={onEnter}
      className="button enter-button"
    >
      <span>{t('enter')}</span>
      <svg className="icon">
        <use href="#icon-arrow" />
      </svg>
    </Button>
  );
}
