import { writable } from 'svelte/store';

// Soil settings (thresholds from Settings sheet)
export const soilSettings = writable({});

// Nutrient visibility (which nutrients show in dropdowns)
export const nutrientVisibility = writable(
  JSON.parse(localStorage.getItem('nutrientVisibility') || '{}')
);

// Decimal places per nutrient
export const decimalPlaces = writable(
  JSON.parse(localStorage.getItem('decimalPlaces') || '{}')
);

// Persist visibility changes
nutrientVisibility.subscribe(v => {
  if (Object.keys(v).length > 0) {
    localStorage.setItem('nutrientVisibility', JSON.stringify(v));
  }
});

// Persist decimal changes
decimalPlaces.subscribe(d => {
  if (Object.keys(d).length > 0) {
    localStorage.setItem('decimalPlaces', JSON.stringify(d));
  }
});
