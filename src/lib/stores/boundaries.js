import { writable, derived } from 'svelte/store';

// Field boundaries keyed by field name
export const boundaries = writable({});

// Derived: sorted field names from boundaries
export const boundaryFieldNames = derived(boundaries, $b =>
  Object.keys($b).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
);
