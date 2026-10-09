import type { PanelProps } from '../../../types/ui';
import type { AvatarStatus } from '../../avatar/types';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
export function SystemPanel({
  open,
  onClose,
  status,
}: PanelProps & { status: AvatarStatus['state'] }) {
  return (
    <ConsolePanel
      id="system-dialog"
      open={open}
      onClose={onClose}
      code="SYSTEM / STATUS"
      title="Estado da interface"
      closeLabel="Fechar estado do sistema"
    >
      {' '}
      <div className="panel-body">
        <dl className="system-list">
          <div>
            <dt>Interface</dt>
            <dd>LOCAL</dd>
          </div>
          <div>
            <dt>Avatar</dt>
            <dd>KURISU · LIVE2D</dd>
          </div>
          <div>
            <dt>Renderização</dt>
            <dd id="system-render">
              {status === 'ready'
                ? 'ATIVA · WEBGL'
                : status === 'error'
                  ? 'INDISPONÍVEL'
                  : 'PREPARANDO'}
            </dd>
          </div>
          <div>
            <dt>Inteligência artificial</dt>
            <dd>NÃO CONECTADA</dd>
          </div>
          <div>
            <dt>Microfone &amp; áudio</dt>
            <dd>NÃO UTILIZADOS</dd>
          </div>
          <div>
            <dt>Autenticação</dt>
            <dd>NÃO IMPLEMENTADA</dd>
          </div>
        </dl>
        <p className="panel-note">
          Esta etapa reúne a interface e o modelo animado. Nenhuma mensagem ou
          gravação é enviada a um provedor.
        </p>
      </div>
    </ConsolePanel>
  );
}
