import { useBackdrop } from '../../../hooks/useBackdrop';
import { useSettings } from '../../settings/store';
export function LoginBackground() {
  const { preferences } = useSettings();
  const ref = useBackdrop('welcome', preferences.effects);
  return (
    <canvas
      id="welcome-background"
      ref={ref}
      className="ambient-background"
      aria-hidden="true"
    />
  );
}
