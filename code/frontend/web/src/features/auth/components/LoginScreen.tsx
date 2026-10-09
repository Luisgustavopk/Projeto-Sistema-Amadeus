import type { Ref } from 'react';
import { LoginBackground } from './LoginBackground';
import { Scanlines } from '../../../components/hud/Scanlines';
import { LoginForm } from './LoginForm';
import logo from '../../../assets/logo.png';
export function LoginScreen({
  visible,
  onEnter,
  enterRef,
}: {
  visible: boolean;
  onEnter: () => void;
  enterRef: Ref<HTMLButtonElement>;
}) {
  return (
    <section
      id="welcome"
      hidden={!visible}
      className="welcome"
      aria-labelledby="welcome-title"
    >
      <LoginBackground />
      <div className="welcome-grid" aria-hidden="true"></div>
      <div className="welcome-shade" aria-hidden="true"></div>
      <Scanlines />
      <div className="welcome-terminal mono" aria-hidden="true">
        <span>AMADEUS // BOOT SEQUENCE</span>
        <span>VISUAL INTERFACE ........ READY</span>
        <span>SUBJECT 001 / K. MAKISE</span>
      </div>
      <div className="welcome-content">
        <p className="eyebrow">MEMORY · PERSONALITY · PRESENCE</p>
        <img
          className="welcome-logo"
          src={logo}
          alt="Amadeus"
          width="500"
          height="332"
        />
        <h1 id="welcome-title">Uma presença. Outra perspectiva.</h1>
        <p className="welcome-description">
          Kurisu Makise, do outro lado da tela.
        </p>
        <LoginForm onEnter={onEnter} enterRef={enterRef} />
        <p className="welcome-note">
          PRÉVIA LOCAL <span>·</span> SEM LOGIN
        </p>
      </div>
      <footer className="welcome-footer mono">
        <span>
          PROJECT AMADEUS <b>//</b> WEB CLIENT
        </span>
        <span>SUBJECT 001</span>
      </footer>
    </section>
  );
}
