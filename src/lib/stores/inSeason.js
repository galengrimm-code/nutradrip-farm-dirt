import { writable, derived } from 'svelte/store';
import { loadInSeasonFromIndexedDB, saveInSeasonToIndexedDB } from '$lib/core/data.js';

// In-season analysis data (tissue, sap, soil, water)
export const inSeasonData = writable([]);

// Derived: filter by type
export const sapData = derived(inSeasonData, $d => $d.filter(r => r.Type === 'SAP'));
export const tissueData = derived(inSeasonData, $d => $d.filter(r => r.Type === 'TIS'));
export const waterData = derived(inSeasonData, $d => $d.filter(r => r.Type === 'WAT'));
export const soilData = derived(inSeasonData, $d => $d.filter(r => r.Type === 'ISS'));

// Derived: unique site IDs
export const inSeasonSiteIds = derived(inSeasonData, $d =>
  [...new Set($d.map(r => r.SiteId).filter(Boolean))].sort()
);

// Load from IndexedDB
export async function loadInSeasonData() {
  const data = await loadInSeasonFromIndexedDB();
  inSeasonData.set(data);
  return data;
}

// Save to IndexedDB
export async function saveInSeasonData(data) {
  inSeasonData.set(data);
  return await saveInSeasonToIndexedDB(data);
}

// Append new records (with duplicate detection)
export async function appendInSeasonData(newRecords, getDuplicateKey) {
  let current;
  inSeasonData.subscribe(d => current = d)();

  const existingKeys = new Set(current.map(r => getDuplicateKey(r)));
  const unique = newRecords.filter(r => !existingKeys.has(getDuplicateKey(r)));

  const merged = [...current, ...unique];
  inSeasonData.set(merged);
  await saveInSeasonToIndexedDB(merged);

  return { added: unique.length, duplicates: newRecords.length - unique.length };
}
