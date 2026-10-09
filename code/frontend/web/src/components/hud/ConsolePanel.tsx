import type { MouseEvent } from 'react';
import type { ConsolePanelProps } from '../../types/ui';
import { Button } from '../ui/Button';
import { useLayoutEffect, useRef } from 'react';
export function ConsolePanel({
  id,
  open,
  onClose,
  code,
  title,
  closeLabel,
  children,
}: ConsolePanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = id.replace('-dialog', '-title');
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  useLayoutEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
    },
    [],
  );
  function backdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      onClose();
  }
  return (
    <dialog
      ref={ref}
      id={id}
      className="panel"
      aria-labelledby={headingId}
      onClick={backdrop}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <header className="panel-header">
        <div>
          <span className="panel-code">{code}</span>
          <h2 id={headingId}>{title}</h2>
        </div>
        <Button
          className="close-button"
          data-close
          onClick={onClose}
          aria-label={closeLabel}
        >
          <svg className="icon">
            <use href="#icon-close" />
          </svg>
        </Button>
      </header>
      {children}
    </dialog>
  );
}
