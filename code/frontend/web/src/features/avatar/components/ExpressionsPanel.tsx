import type { PanelProps } from '../../../types/ui';
import type { VoicePreview } from '../types';
import type { ReactionKey } from '../expressions';
import { Button } from '../../../components/ui/Button';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
import { ACTING_CATALOG, QUICK_REACTIONS } from '../expressions';
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
        <h3 className="section-label">Poses do rig extra</h3>
        <div className="reaction-grid" aria-label="Poses do rig extra">
          {[
            ['original', 'Avatar original'],
            ['arms-crossed', 'Braços cruzados'],
            ['hand-on-hip', 'Mão na cintura'],
            ['idea-pointing', 'Indicador levantado'],
            ['lean-forward', 'Inclinar com mão na cintura'],
          ].map(([pose, label]) => (
            <Button key={pose} className="reaction-button" data-rig-pose={pose}
              disabled={!ready || performance.pending}
              aria-pressed={performance.rigPose === pose}
              onClick={() => void performance.chooseRigPose(pose)}>
              {label}
            </Button>
          ))}
        </div>
        <p className="panel-note">
          O catálogo de expressões foi criado para o avatar original. No rig v16,
          apenas os controles já desenhados nele respondem; sorriso, sobrancelhas
          e blush ainda precisam de autoria no modelo. A cabeça não gira em XY
          no extremo da inclinação.
        </p>
        <details className="catalog-details">
          <summary>
            Catálogo completo · {ACTING_CATALOG.expressions.length} expressões e{' '}
            {ACTING_CATALOG.motions.length} movimentos
          </summary>
          <ActingCatalog performance={performance} ready={ready} />
        </details>
        <p className="panel-note">
          Falas e movimento da boca são uma prévia visual, sem IA ou áudio.
        </p>
      </div>
    </ConsolePanel>
  );
}
