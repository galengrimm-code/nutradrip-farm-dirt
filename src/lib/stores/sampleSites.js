import { writable, derived } from 'svelte/store';

// Sample sites data from Google Sheets
export const sampleSites = writable([]);

// Derived: active (non-deleted) sites
export const activeSampleSites = derived(sampleSites, $sites =>
  $sites.filter(s => s.Active !== 'FALSE')
);

// Type metadata
export const SITE_TYPES = {
  TIS: { name: 'Tissue', emoji: '🌿', color: '#22c55e', bgColor: '#dcfce7' },
  WAT: { name: 'Water', emoji: '💧', color: '#3b82f6', bgColor: '#dbeafe' },
  SAP: { name: 'Sap', emoji: '🧪', color: '#f59e0b', bgColor: '#fef3c7' },
  ISS: { name: 'In-Season Soil', emoji: '🌱', color: '#8b5cf6', bgColor: '#ede9fe' }
};
