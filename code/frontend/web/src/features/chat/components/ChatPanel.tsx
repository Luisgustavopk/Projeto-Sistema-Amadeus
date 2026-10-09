import type { PanelProps } from '../../../types/ui';
import type { ChatStore } from '../../chat/store';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
import { MessageLog, MessageCount } from './MessageLog';
import { ChatInput } from './ChatInput';
export function ChatPanel({
  open,
  onClose,
  log,
}: PanelProps & { log: ChatStore }) {
  return (
    <ConsolePanel
      id="chat-dialog"
      open={open}
      onClose={onClose}
      code="CHANNEL / 01"
      title="Canal de texto"
      closeLabel="Fechar canal de texto"
    >
      {' '}
      <div className="panel-body">
        <div className="panel-meta">
          <MessageCount messages={log.messages} />
          <span className="local-badge">SESSÃO LOCAL</span>
        </div>
        <MessageLog
          messages={log.messages}
          id="chat-log"
          label="Mensagens desta sessão"
          role={'log'}
        />
        <ChatInput onSend={log.appendUser} />
        <p className="panel-note">
          As mensagens ficam nesta sessão. A IA ainda não está conectada.
        </p>
      </div>
    </ConsolePanel>
  );
}
