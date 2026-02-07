/**
 * init.js - App initialization
 * Loads cached data into stores, initializes Google APIs
 */

import { isSignedIn, userName, isLoading, isDemoMode, showToast } from '$lib/stores/app.js';
import { samples } from '$lib/stores/samples.js';
import { boundaries } from '$lib/stores/boundaries.js';
import { soilSettings } from '$lib/stores/settings.js';
import { irrigationZones } from '$lib/stores/irrigationZones.js';
import {
  SheetsAPI,
  loadFromIndexedDB,
  loadFieldBoundaries,
  loadIrrigationZonesFromIndexedDB,
  migrateDataIfNeeded,
  needsMigration
} from './data.js';
import { tagSamplesWithIrrigation } from './import-utils.js';

export async function initializeApp() {
  isLoading.set(true);

  try {
    // Run data migration if needed
    migrateDataIfNeeded();

    // Load cached data from IndexedDB/localStorage
    await loadCachedData();

    // Initialize Google API (non-blocking — runs in background)
    initGoogleApi();
  } catch (e) {
    console.error('App initialization error:', e);
  } finally {
    isLoading.set(false);
  }
}

async function loadCachedData() {
  // Try IndexedDB first
  const idbData = await loadFromIndexedDB();
  if (idbData) {
    if (idbData.samples?.length > 0) {
      samples.set(idbData.samples);
      console.log(`[Init] Loaded ${idbData.samples.length} samples from IndexedDB`);
    }
    if (idbData.boundaries && Object.keys(idbData.boundaries).length > 0) {
      boundaries.set(idbData.boundaries);
      console.log(`[Init] Loaded ${Object.keys(idbData.boundaries).length} field boundaries from IndexedDB`);
    }
  }

  // Fall back to localStorage for boundaries if not in IndexedDB
  let currentBoundaries;
  boundaries.subscribe(b => currentBoundaries = b)();
  if (!currentBoundaries || Object.keys(currentBoundaries).length === 0) {
    const localBoundaries = loadFieldBoundaries();
    if (Object.keys(localBoundaries).length > 0) {
      boundaries.set(localBoundaries);
      console.log(`[Init] Loaded ${Object.keys(localBoundaries).length} boundaries from localStorage`);
    }
  }

  // Load irrigation zones from IndexedDB
  try {
    const zones = await loadIrrigationZonesFromIndexedDB();
    if (zones && zones.length > 0) {
      irrigationZones.set(zones);
      console.log(`[Init] Loaded ${zones.length} irrigation zones from IndexedDB`);

      // Tag samples with irrigation data
      let currentSamples;
      samples.subscribe(s => currentSamples = s)();
      if (currentSamples && currentSamples.length > 0) {
        tagSamplesWithIrrigation(currentSamples, zones);
        samples.set([...currentSamples]);
        const tagged = currentSamples.filter(s => s.irrigated).length;
        if (tagged > 0) console.log(`[Init] Tagged ${tagged} samples as irrigated`);
      }
    }
  } catch (e) { /* ignore */ }

  // Load soil settings from localStorage
  try {
    const saved = localStorage.getItem('soilSettings');
    if (saved) soilSettings.set(JSON.parse(saved));
  } catch (e) { /* ignore */ }
}

function initGoogleApi() {
  // Wait for Google API scripts to load
  const checkAndInit = () => {
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
      SheetsAPI.init().then(() => {
        // Wire sign-in state changes to the Svelte store
        SheetsAPI.onSignInChange = (signedIn) => {
          isSignedIn.set(signedIn);
          if (signedIn) loadFromSheets();
        };

        if (SheetsAPI.isSignedIn) {
          isSignedIn.set(true);
          console.log('[Init] Google API initialized, user is signed in');
          // Load fresh data from Sheets in background
          loadFromSheets();
        } else {
          console.log('[Init] Google API initialized, user is not signed in');
        }
      }).catch(e => {
        console.warn('[Init] Google API init failed (offline?):', e.message);
      });
    } else {
      // Scripts not loaded yet, retry
      setTimeout(checkAndInit, 500);
    }
  };
  checkAndInit();
}

async function loadFromSheets() {
  try {
    const [fields, sheetSamples, settings] = await Promise.all([
      SheetsAPI.getFields(),
      SheetsAPI.getSamples(),
      SheetsAPI.getSettings()
    ]);

    // Update boundaries from fields
    if (fields && fields.length > 0) {
      const boundariesObj = {};
      fields.forEach(f => {
        if (f.boundary) {
          boundariesObj[f.name] = {
            boundary: f.boundary,
            farmId: f.farmId || '',
            acres: f.acres || 0
          };
        }
      });
      if (Object.keys(boundariesObj).length > 0) {
        boundaries.set(boundariesObj);
      }
    }

    // Update samples
    if (sheetSamples && sheetSamples.length > 0) {
      // Re-tag with irrigation zones if any exist
      let currentZones;
      irrigationZones.subscribe(z => currentZones = z)();
      if (currentZones && currentZones.length > 0) {
        tagSamplesWithIrrigation(sheetSamples, currentZones);
      }
      samples.set(sheetSamples);
    }

    // Update settings
    if (settings && Object.keys(settings).length > 0) {
      soilSettings.set(settings);
    }

    console.log(`[Init] Loaded from Sheets: ${sheetSamples?.length || 0} samples, ${fields?.length || 0} fields`);
  } catch (e) {
    console.warn('[Init] Failed to load from Sheets:', e.message);
  }
}
