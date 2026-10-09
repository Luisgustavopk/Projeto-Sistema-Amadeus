import type { OpenPanel } from '../../types/ui';
import type { useFullscreen } from '../../hooks/useFullscreen';
import { Button } from '../ui/Button';
export function SideRail({
  onOpen,
  onLeave,
  fullscreen,
}: {
  onOpen: OpenPanel;
  onLeave: () => void;
  fullscreen: ReturnType<typeof useFullscreen>;
}) {
  return (
    <nav className="control-rail" aria-label="Controles da interface">
      <Button
        className="icon-button"
        data-dialog="chat-dialog"
        onClick={() => onOpen('chat')}
        aria-label="Conversar por texto"
      >
        <svg className="icon">
          <use href="#icon-chat" />
        </svg>
        <span className="tooltip">CONVERSAR</span>
      </Button>
      <Button
        className="icon-button"
        data-dialog="history-dialog"
        onClick={() => onOpen('history')}
        aria-label="Histórico da sessão"
      >
        <svg className="icon">
          <use href="#icon-history" />
        </svg>
        <span className="tooltip">HISTÓRICO</span>
      </Button>
      <Button
        className="icon-button"
        data-dialog="avatar-dialog"
        onClick={() => onOpen('avatar')}
        aria-label="Expressões do avatar"
      >
        <svg className="icon">
          <use href="#icon-avatar" />
        </svg>
        <span className="tooltip">EXPRESSÕES</span>
      </Button>
      <Button
        className="icon-button"
        data-dialog="settings-dialog"
        onClick={() => onOpen('settings')}
        aria-label="Configurações"
      >
        <svg className="icon">
          <use href="#icon-settings" />
        </svg>
        <span className="tooltip">CONFIGURAÇÕES</span>
      </Button>
      <span className="rail-divider" aria-hidden="true"></span>
      <Button
        id="fullscreen"
        onClick={fullscreen.toggle}
        className="icon-button"
        aria-label={
          fullscreen.active ? 'Sair da tela cheia' : 'Entrar em tela cheia'
        }
        aria-pressed={fullscreen.active}
      >
        <svg className="icon">
          <use href="#icon-expand" />
        </svg>
        <span className="tooltip">TELA CHEIA</span>
      </Button>
      <Button
        id="leave"
        onClick={onLeave}
        className="icon-button"
        aria-label="Voltar à tela inicial"
      >
        <svg className="icon">
          <use href="#icon-back" />
        </svg>
        <span className="tooltip">VOLTAR</span>
      </Button>
    </nav>
  );
}
