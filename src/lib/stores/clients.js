import { writable, derived } from 'svelte/store';
import { loadClientsData, saveClientsData, loadFarmsData, saveFarmsData } from '$lib/core/data.js';

// Core data stores
export const clients = writable(loadClientsData());
export const farms = writable(loadFarmsData());

// Persist changes to localStorage
clients.subscribe(c => { if (c.length > 0 || localStorage.getItem('clientsData')) saveClientsData(c); });
farms.subscribe(f => { if (f.length > 0 || localStorage.getItem('farmsData')) saveFarmsData(f); });

// Active selection (persisted via filters.js activeClientId/activeFarmId)

// Derived: farms for a given client
export function getFarmsForClient(clientId) {
  let farmsVal;
  farms.subscribe(f => farmsVal = f)();
  return farmsVal.filter(f => f.clientId === clientId);
}

// Derived: client name lookup
export const clientsMap = derived(clients, $c => {
  const map = {};
  $c.forEach(c => { map[c.id] = c; });
  return map;
});

// Derived: farm name lookup
export const farmsMap = derived(farms, $f => {
  const map = {};
  $f.forEach(f => { map[f.id] = f; });
  return map;
});
