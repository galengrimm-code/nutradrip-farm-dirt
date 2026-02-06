import { writable, derived } from 'svelte/store';

// Core sample data
export const samples = writable([]);

// Derived: unique years from sample data
export const uniqueYears = derived(samples, $s =>
  [...new Set($s.map(s => s.year).filter(y => y))].sort()
);

// Derived: unique fields from sample data
export const uniqueFields = derived(samples, $s =>
  [...new Set($s.map(s => s.field).filter(f => f))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  )
);
