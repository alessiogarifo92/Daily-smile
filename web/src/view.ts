import type { Bouquet } from '../../shared/flowers';

/** What the Today tab needs from a bouquet renderer, 2D sprites or 3D. */
export interface BouquetView {
  show(bouquet: Bouquet): void;
  /** Pauses the render loop while the bouquet is off screen (saves battery and CPU). */
  setActive(active: boolean): void;
  dispose(): void;
}
