import { writable } from 'svelte/store';

/**
 * Irrigation zones store.
 * Each zone: {
 *   id: string,
 *   name: string,
 *   type: 'circle' | 'rectangle',
 *   center?: [lat, lng],   // circle
 *   radius?: number,        // circle, meters
 *   bounds?: [[lat,lng],[lat,lng]], // rectangle [SW, NE]
 *   createdAt: string (ISO)
 * }
 */
export const irrigationZones = writable([]);
