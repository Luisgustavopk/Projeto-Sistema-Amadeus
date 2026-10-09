import { useBackdrop } from '../../../hooks/useBackdrop';
import { useSettings } from '../../settings/store';
export function StageBackdrop() {
  const { preferences } = useSettings();
  const ref = useBackdrop('home', preferences.effects);
  return (
    <canvas
      id="stage-background"
      ref={ref}
      className="ambient-background"
      aria-hidden="true"
    />
  );
}
