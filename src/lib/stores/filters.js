import { writable } from 'svelte/store';

// Active client/farm selection (persisted)
const savedSelection = {
  clientId: localStorage.getItem('activeClientId') || 'all',
  farmId: localStorage.getItem('activeFarmId') || 'all'
};

export const activeClientId = writable(savedSelection.clientId);
export const activeFarmId = writable(savedSelection.farmId);

// Persist selection changes
activeClientId.subscribe(v => localStorage.setItem('activeClientId', v));
activeFarmId.subscribe(v => localStorage.setItem('activeFarmId', v));

// Map-specific filters
export const selectedField = writable('all');
export const selectedAttribute = writable('pH');
export const selectedYear = writable('most_recent');

// Compare mode
export const compareMode = writable(false);
export const compareYear = writable(null);
