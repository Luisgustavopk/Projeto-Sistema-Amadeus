import type { AvatarRuntime, AvatarStatus } from '../types';
export function createAvatar(options: {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  onStatus: (status: AvatarStatus) => void;
}): AvatarRuntime;
