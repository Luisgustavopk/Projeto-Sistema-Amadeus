export type ReleaseActivity = () => void;

export interface ConfigurationGate {
  beginConfiguration(): ReleaseActivity;
}
export interface ExecutionGate {
  beginExecution(): ReleaseActivity;
}
export interface CallGate {
  acquireCall(): ReleaseActivity;
  readonly activeCalls: number;
}
