import type { PanelProps } from '../../../types/ui';
import type { ChatStore } from '../../chat/store';
import { Button } from '../../../components/ui/Button';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
import { MessageLog, MessageCount } from '../../chat/components/MessageLog';
export function HistoryPanel({
  open,
  onClose,
  log,
}: PanelProps & { log: ChatStore }) {
  return (
    <ConsolePanel
      id="history-dialog"
      open={open}
      onClose={onClose}
      code="SESSION / LOG"
      title="Registro da sessão"
      closeLabel="Fechar histórico"
    >
      {' '}
      <div className="panel-body">
        <div className="panel-meta">
          <MessageCount messages={log.messages} />
          <span className="local-badge">NESTA ABA</span>
        </div>
        <MessageLog
          messages={log.messages}
          id="history-log"
          label="Histórico local"
          role={undefined}
        />
        <div className="panel-actions">
          <Button
            id="export-history"
            onClick={log.exportHistory}
            className="button outline-button"
            disabled={!log.messages.length}
          >
            <svg className="icon">
              <use href="#icon-download" />
            </svg>
            EXPORTAR
          </Button>
          <Button
            id="clear-history"
            onClick={log.clear}
            className="button ghost-button"
            disabled={!log.messages.length}
          >
            <svg className="icon">
              <use href="#icon-trash" />
            </svg>
            Limpar sessão
          </Button>
        </div>
        <p className="panel-note">
          O histórico não é salvo ao fechar ou recarregar a página.
        </p>
      </div>
    </ConsolePanel>
  );
}
