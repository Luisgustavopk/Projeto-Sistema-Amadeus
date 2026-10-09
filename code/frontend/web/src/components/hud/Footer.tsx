import type { OpenPanel } from '../../types/ui';
import { Button } from '../ui/Button';
import { SessionClock } from './SessionClock';
export function Footer({
  startedAt,
  onOpen,
}: {
  startedAt: number;
  onOpen: OpenPanel;
}) {
  return (
    <footer className="hud-footer mono">
      <span>
        AMADEUS SYSTEM <b>//</b> VER. 0.1.0
      </span>
      <span className="session-time">
        SESSION <SessionClock startedAt={startedAt} />
      </span>
      <Button
        className="footer-info"
        data-dialog="system-dialog"
        onClick={() => onOpen('system')}
      >
        INTERFACE LOCAL{' '}
        <svg className="icon">
          <use href="#icon-info" />
        </svg>
      </Button>
    </footer>
  );
}
