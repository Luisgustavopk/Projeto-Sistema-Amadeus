import type { AvatarStatus } from '../../features/avatar/types';
export function Telemetry({
  status,
  reaction,
}: {
  status: AvatarStatus['state'];
  reaction: string;
}) {
  return (
    <aside className="telemetry" aria-label="Estado da prévia">
      <span className="telemetry-heading mono">SIGNAL MONITOR</span>
      <dl>
        <div>
          <dt>PERSONALITY</dt>
          <dd>KURISU</dd>
        </div>
        <div>
          <dt>RENDER</dt>
          <dd id="render-status">
            {status === 'ready'
              ? 'LIVE2D'
              : status === 'error'
                ? 'OFFLINE'
                : 'LOADING'}
          </dd>
        </div>
        <div>
          <dt>SESSION</dt>
          <dd>LOCAL</dd>
        </div>
      </dl>
      <div className="signal-bars" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
        <i></i>
      </div>
      <span id="current-expression" className="telemetry-expression mono">
        {reaction.toUpperCase()}
      </span>
    </aside>
  );
}
