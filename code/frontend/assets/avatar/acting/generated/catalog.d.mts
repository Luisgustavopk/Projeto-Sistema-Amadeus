export interface ActingEvent {
  intent: string;
  emotion: string;
  intensity: number;
}
export interface Parameter {
  Id: string;
  Value: number;
  Blend: 'Add' | 'Multiply' | 'Overwrite';
}
export interface ActingExpression {
  Name: string;
  File: string;
  kind: 'emotion' | 'extra';
  emotion?: string;
  tier?: 'sutil' | 'media' | 'forte';
  desc?: string;
  ref?: string;
  parameters: Parameter[];
}
export interface ActingMotion {
  Name: string;
  File: string;
  duration: number;
  FadeInTime: number;
  FadeOutTime: number;
  pose: Record<string, [number, number][]>;
  presentation?: {
    scale: [number, number][];
    x: [number, number][];
    y: [number, number][];
  };
}
export const ACTING_CATALOG: {
  emotions: string[];
  intents: string[];
  expressions: ActingExpression[];
  motions: ActingMotion[];
};
