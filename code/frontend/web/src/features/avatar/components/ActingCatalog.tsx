import { useMemo, useState } from 'react';
import {
  ACTING_CATALOG,
  EMOTION_LABELS,
  REACTIONS,
  readableName,
} from '../expressions';
import type { VoicePreview } from '../types';
import { Button } from '../../../components/ui/Button';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function ActingCatalog({
  performance,
  ready,
}: {
  performance: VoicePreview;
  ready: boolean;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [tier, setTier] = useState('all');
  const [emotion, setEmotion] = useState('curiosidade');
  const [intent, setIntent] = useState('reagir');
  const [intensity, setIntensity] = useState(0.5);
  const entries = useMemo(
    () =>
      ACTING_CATALOG.expressions.filter(
        (e) =>
          (kind === 'all' || e.kind === kind) &&
          (tier === 'all' || e.tier === tier) &&
          normalize(REACTIONS[e.Name].label + ' ' + e.Name).includes(
            normalize(search),
          ),
      ),
    [search, kind, tier],
  );
  const disabled = !ready || performance.pending;
  return (
    <div className="acting-catalog">
      <div className="catalog-filters">
        <label>
          Buscar expressão
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Raiva, piscadela, sorriso…"
          />
        </label>
        <label>
          Categoria
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Todas</option>
            <option value="emotion">Emoções</option>
            <option value="extra">Gestos faciais</option>
          </select>
        </label>
        <label>
          Intensidade
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="all">Todas</option>
            <option value="sutil">Sutil</option>
            <option value="media">Média</option>
            <option value="forte">Forte</option>
          </select>
        </label>
      </div>
      <p className="panel-note" role="status">
        {entries.length} de {ACTING_CATALOG.expressions.length} expressões ·
        configuração selecionada: {performance.selected.label}
      </p>
      <div
        className="reaction-grid catalog-grid"
        aria-label="Catálogo completo de expressões"
      >
        {entries.map((e) => (
          <Button
            key={e.Name}
            className="reaction-button"
            disabled={disabled}
            aria-pressed={performance.reaction === e.Name}
            data-expression={e.Name}
            onClick={() => void performance.select(e.Name)}
          >
            {REACTIONS[e.Name].label}
          </Button>
        ))}
      </div>
      <h3 className="section-label">Compor emoção e intenção</h3>
      <div className="catalog-filters">
        <label>
          Emoção da atuação
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
            {ACTING_CATALOG.emotions.map((e) => (
              <option key={e} value={e}>
                {EMOTION_LABELS[e]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Intenção da atuação
          <select value={intent} onChange={(e) => setIntent(e.target.value)}>
            {ACTING_CATALOG.intents.map((i) => (
              <option key={i} value={i}>
                {readableName(i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Intensidade da atuação · {intensity.toFixed(2)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
        </label>
      </div>
      <Button
        className="button outline-button"
        disabled={disabled}
        onClick={() => performance.chooseActing({ emotion, intent, intensity })}
      >
        Aplicar atuação
      </Button>
      <h3 className="section-label">Movimentos</h3>
      <div className="reaction-grid">
        {ACTING_CATALOG.motions.map((m) => (
          <Button
            key={m.Name}
            className="reaction-button"
            data-motion={m.Name}
            disabled={disabled}
            onClick={() => void performance.playMotion(m.Name)}
          >
            {readableName(m.Name)}
            <span>{m.duration} s</span>
          </Button>
        ))}
      </div>
      <p className="panel-note">
        As 177 combinações estão disponíveis para avaliação visual. O gesto
        acompanha a emoção; os controles de olhar cedem prioridade à atuação.
        Sem IA ou áudio nesta prévia.
      </p>
    </div>
  );
}
