import { writable } from 'svelte/store';
import { loadYieldFromIndexedDB, saveYieldToIndexedDB } from '$lib/core/data.js';

// Yield data store
export const yieldData = writable([]);

// Load yield data from IndexedDB
export async function loadYieldData() {
  const data = await loadYieldFromIndexedDB();
  yieldData.set(data);
  return data;
}

// Save yield data to IndexedDB
export async function saveYieldData(data) {
  yieldData.set(data);
  return await saveYieldToIndexedDB(data);
}

// Append yield data (merge with existing)
export async function appendYieldData(newData) {
  let current;
  yieldData.subscribe(d => current = d)();
  const merged = [...current, ...newData];
  yieldData.set(merged);
  return await saveYieldToIndexedDB(merged);
}
