export interface BackdropRuntime { configure(value: {effects: boolean}): void; setScreen(screen: 'welcome' | 'home'): void; suspend(): void; resume(): void; destroy(): void; }
export function createVisualEffects(options: {canvas: HTMLCanvasElement; screen: 'welcome' | 'home'}): BackdropRuntime;
