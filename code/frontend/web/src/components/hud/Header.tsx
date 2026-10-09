import type { AvatarStatus } from '../../features/avatar/types';
import type { OpenPanel } from '../../types/ui';
import { Button } from '../ui/Button';
import logo from '../../assets/logo.png';
export function Header({
  status,
  onOpen,
}: {
  status: AvatarStatus['state'];
  onOpen: OpenPanel;
}) {
  return (
    <header className="hud-header">
      <div className="brand-lockup">
        <img
          className="brand-logo"
          src={logo}
          alt="Amadeus"
          width="500"
          height="332"
        />
        <span className="brand-caption mono">NEURAL INTERFACE</span>
      </div>
      <Button
        className="system-status"
        data-dialog="system-dialog"
        onClick={() => onOpen('system')}
        aria-label="Ver estado da interface"
      >
        <span className="eyebrow">AMADEUS PROJECT</span>
        <span className="status-line">
          <span
            id="status-dot"
            className={status === 'error' ? 'status-dot failed' : 'status-dot'}
          ></span>
          <span id="avatar-status">
            {status === 'ready'
              ? 'LIVE2D ATIVO'
              : status === 'error'
                ? 'AVATAR INDISPONÍVEL'
                : 'PREPARANDO AVATAR'}
          </span>
        </span>
        <span className="subject mono">SUBJECT 001 · K. MAKISE</span>
      </Button>
    </header>
  );
}
