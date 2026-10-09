import type { AvatarController } from '../types';
import { Button } from '../../../components/ui/Button';
export function Live2DStage({ avatar }: { avatar: AvatarController }) {
  return (
    <div id="avatar-stage" ref={avatar.hostRef} className="avatar-stage">
      <canvas
        id="avatar-canvas"
        ref={avatar.canvasRef}
        role="img"
        aria-label="Avatar Live2D animado de Kurisu Makise"
      ></canvas>
      <div
        id="avatar-placeholder"
        hidden={avatar.status.state === 'ready'}
        className={
          avatar.status.state === 'error'
            ? 'avatar-placeholder failed'
            : 'avatar-placeholder'
        }
        role="status"
      >
        <span className="loading-orbit" aria-hidden="true"></span>
        <p id="avatar-loading-text">
          {avatar.status.message ?? 'Preparando Kurisu…'}
        </p>
        <Button
          id="retry-avatar"
          onClick={avatar.retry}
          className="button outline-button"
          hidden={avatar.status.state !== 'error'}
        >
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
