import type { PanelProps } from '../../../types/ui';
import type { Preferences } from '../preferences';
import type { SettingsStore } from '../store';
import { Switch } from '../../../components/ui/Switch';
import { Slider } from '../../../components/ui/Slider';
import { Button } from '../../../components/ui/Button';
import { ConsolePanel } from '../../../components/hud/ConsolePanel';
export function SettingsPanel({
  open,
  onClose,
  preferences,
  onChange,
  onReset,
  onSave,
}: PanelProps & {
  preferences: Preferences;
  onChange: SettingsStore['change'];
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <ConsolePanel
      id="settings-dialog"
      open={open}
      onClose={onClose}
      code="INTERFACE / PREFERENCES"
      title="Configurações"
      closeLabel="Fechar configurações"
    >
      {' '}
      <div className="panel-body">
        <p className="section-label mono">AVATAR &amp; APARÊNCIA</p>
        <label className="setting-row" htmlFor="setting-subtitles">
          <span>
            <strong>Legendas</strong>
            <small>Fala da prévia na tela principal</small>
          </span>
          <Switch
            id="setting-subtitles"
            checked={preferences.subtitles}
            onChange={(event) => onChange('subtitles', event.target.checked)}
            className="switch"
          />
        </label>
        <label className="setting-row" htmlFor="setting-tracking">
          <span>
            <strong>Acompanhar o olhar</strong>
            <small>Kurisu acompanha o cursor</small>
          </span>
          <Switch
            id="setting-tracking"
            checked={preferences.tracking}
            onChange={(event) => onChange('tracking', event.target.checked)}
            className="switch"
          />
        </label>
        <label className="setting-row" htmlFor="setting-effects">
          <span>
            <strong>Efeito de tela</strong>
            <small>Scanlines, varredura e ruído de TV</small>
          </span>
          <Switch
            id="setting-effects"
            checked={preferences.effects}
            onChange={(event) => onChange('effects', event.target.checked)}
            className="switch"
          />
        </label>
        <label className="setting-row" htmlFor="setting-zoom">
          <span>
            <strong>Enquadramento</strong>
            <small>
              <output id="zoom-value" htmlFor="setting-zoom">
                {preferences.zoom}%
              </output>
            </small>
          </span>
          <Slider
            id="setting-zoom"

            min="80"
            max="140"
            step="5"
            value={preferences.zoom}
            onInput={(event) =>
              onChange('zoom', Number(event.currentTarget.value))
            }
            onChange={(event) => onChange('zoom', Number(event.target.value))}
          />
        </label>
        <div className="panel-actions">
          <Button
            id="reset-settings"
            onClick={onReset}
            className="button ghost-button"
          >
            Restaurar padrão
          </Button>
          <Button
            id="save-settings"
            onClick={onSave}
            className="button outline-button"
          >
            SALVAR
          </Button>
        </div>
        <p className="panel-note">
          Somente essas preferências ficam salvas neste navegador. A Kurisu
          permanece animada enquanto a tela principal está visível.
        </p>
      </div>
    </ConsolePanel>
  );
}
