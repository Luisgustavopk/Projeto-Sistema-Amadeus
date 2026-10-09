import type { PanelProps } from '../../../types/ui';
import type { VoicePreview } from '../types';
import type { ReactionKey } from '../expressions';
import { Button } from '../../../components/ui/Button';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
import { REACTIONS } from '../expressions';
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
      title="Uma reação de cada vez"
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
          {Object.entries(REACTIONS).map(([key, value], index) => (
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
        <p className="panel-note">
          Falas e movimento da boca são uma prévia visual, sem IA ou áudio.
        </p>
      </div>
    </ConsolePanel>
  );
}
