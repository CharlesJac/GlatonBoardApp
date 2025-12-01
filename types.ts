
export interface SimulationConfig {
  rowCount: number;
  ballCount: number;
  bucketCount: number;
  pegSize: number;
  ballSize: number;
  ballRestitution: number;
  dropSpeedMs: number;
}

export interface BallColor {
  id: string;
  color: string;
  name: string;
}

export interface BallDefinition {
  color: BallColor;
  count: number;
}

export type SimulationStatus = 'empty' | 'filled' | 'running' | 'paused' | 'completed';

export const DEFAULT_COLORS: BallColor[] = [
  { id: '1', color: '#3b82f6', name: 'Blue' },   // blue-500
  { id: '2', color: '#ef4444', name: 'Red' },    // red-500
  { id: '3', color: '#10b981', name: 'Green' },  // green-500
  { id: '4', color: '#f59e0b', name: 'Amber' },  // amber-500
  { id: '5', color: '#8b5cf6', name: 'Purple' }, // purple-500
];
