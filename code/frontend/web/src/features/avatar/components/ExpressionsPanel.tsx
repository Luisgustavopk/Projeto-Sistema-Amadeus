import type { PanelProps } from '../../../types/ui';
import type { VoicePreview } from '../types';
import type { ReactionKey } from '../expressions';
import { Button } from '../../../components/ui/Button';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
import { QUICK_REACTIONS } from '../expressions';
import { ActingCatalog } from './ActingCatalog';
export function ExpressionsPanel({
  open,
  onClose,
  performance,
  ready,
}: PanelProps & { performance: VoicePreview; ready: boolean }) {
  return (
    <ConsolePanel
      id="avatar-dialog"
      open={open}
      onClose={onClose}
      code="SUBJECT / EXPRESSION"
      title="Expressões e movimentos"
      closeLabel="Fechar expressões"
    >
      {' '}
      <div className="panel-body">
        <p className="panel-intro">
          Escolha uma expressão para vê-la no avatar.
        </p>
        <div
          id="reaction-options"
          className="reaction-grid"
          aria-label="Expressões disponíveis"
          aria-busy={performance.pending}
        >
          {Object.entries(QUICK_REACTIONS).map(([key, value], index) => (
            <Button
              key={key}
              type="button"
              className="reaction-button"
              disabled={!ready || performance.pending}
              aria-pressed={key === performance.reaction}
              onClick={async () => {
                if (await performance.select(key as ReactionKey)) onClose();
              }}
            >
              {value.label}
              <span>{String(index + 1).padStart(2, '0')}</span>
            </Button>
          ))}
        </div>
        <Button
          className="reaction-button arm-control"
          disabled={!ready || performance.pending}
          aria-pressed={performance.arms}
          onClick={performance.toggleArms}
        >
          Mão no queixo / trocar braços
          <span>{performance.arms ? 'ATIVO' : 'INATIVO'}</span>
        </Button>
        <details className="catalog-details">
          <summary>Catálogo completo · 177 expressões e 12 movimentos</summary>
          <ActingCatalog performance={performance} ready={ready} />
        </details>
        <p className="panel-note">
          Falas e movimento da boca são uma prévia visual, sem IA ou áudio.
        </p>
      </div>
    </ConsolePanel>
  );
}
