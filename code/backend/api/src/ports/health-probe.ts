export interface HealthProbe {
  isHealthy(): Promise<boolean>;
}
