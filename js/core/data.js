/**
 * data.js - Core data management module
 * Handles localStorage, IndexedDB, Google Sheets API calls, and load/save functions
 */
(function() {
'use strict';

// ========== DATA CONFIG ==========
const DataConfig = window.DataConfig = {
  CLIENT_ID: '714780458094-9rde31taeottmavhl5t0uo8b9kfpergc.apps.googleusercontent.com',
  API_KEY: 'AIzaSyCOSDbrAlc3ct2-lRvJv1y7V0nV7haWc9E',
  get SHEET_ID() {
    const stored = localStorage.getItem('googleSheetId');
    if (!stored) return null;
    // Extract ID from URL if it's a full URL
    if (stored.includes('docs.google.com') || stored.includes('/d/')) {
      const match = stored.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) return match[1];
    }
    return stored;
  },
  SHEETS: { FIELDS: 'Fields', SAMPLES: 'Samples', SETTINGS: 'Settings' }
};

// ========== INDEXEDDB ==========
const DB_NAME = 'SoilAppDB';
const DB_VERSION = 2; // v2: Added yield object store

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('boundaries')) db.createObjectStore('boundaries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('yield')) db.createObjectStore('yield', { keyPath: 'id' });
    };
  });
}

async function loadFromIndexedDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(['samples', 'boundaries'], 'readonly');
    const samplesData = await new Promise((resolve, reject) => {
      const req = tx.objectStore('samples').get('all');
      req.onsuccess = () => resolve(req.result?.data || []);
      req.onerror = reject;
    });
    const boundariesData = await new Promise((resolve, reject) => {
      const req = tx.objectStore('boundaries').get('all');
      req.onsuccess = () => resolve(req.result?.data || {});
      req.onerror = reject;
    });
    db.close();
    return { samples: samplesData, boundaries: boundariesData };
  } catch (e) { return null; }
}

async function saveToIndexedDB(samples, boundaries) {
  try {
    const db = await openDB();
    const tx = db.transaction(['samples', 'boundaries'], 'readwrite');
    tx.objectStore('samples').put({ id: 'all', data: samples });
    tx.objectStore('boundaries').put({ id: 'all', data: boundaries });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
    localStorage.setItem('usingIndexedDB', 'true');
    return true;
  } catch (e) {
    console.error('IndexedDB save error:', e);
    return false;
  }
}

async function loadYieldFromIndexedDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(['yield'], 'readonly');
    const yieldData = await new Promise((resolve, reject) => {
      const req = tx.objectStore('yield').get('all');
      req.onsuccess = () => resolve(req.result?.data || []);
      req.onerror = reject;
    });
    db.close();
    return yieldData;
  } catch (e) { return []; }
}

async function saveYieldToIndexedDB(yieldData) {
  try {
    const db = await openDB();
    const tx = db.transaction(['yield'], 'readwrite');
    tx.objectStore('yield').put({ id: 'all', data: yieldData });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
    return true;
  } catch (e) {
    console.error('IndexedDB yield save error:', e);
    return false;
  }
}

// ========== SHEETS API ==========
let tokenClient;
let accessToken = null;
let tokenExpiry = null;

const SheetsAPI = {
  isInitialized: false,
  isSignedIn: false,
  onSignInChange: function(isSignedIn) { console.log('Sign-in state:', isSignedIn); },

  async init() {
    return new Promise((resolve, reject) => {
      gapi.load('client', async () => {
        try {
          await gapi.client.init({
            apiKey: DataConfig.API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
          });
          this.isInitialized = true;

          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: DataConfig.CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            callback: (response) => {
              if (response.error) {
                console.error('Token error:', response);
                return;
              }
              accessToken = response.access_token;
              tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
              localStorage.setItem('googleAccessToken', accessToken);
              localStorage.setItem('googleTokenExpiry', tokenExpiry.toString());
              gapi.client.setToken({ access_token: accessToken });
              this.isSignedIn = true;
              this.onSignInChange(true);
            },
          });

          const savedToken = localStorage.getItem('googleAccessToken');
          const savedExpiry = localStorage.getItem('googleTokenExpiry');
          if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry)) {
            accessToken = savedToken;
            tokenExpiry = parseInt(savedExpiry);
          }

          setInterval(() => this.checkTokenRefresh(), 300000);
          resolve(true);
        } catch (error) {
          console.error('Error initializing Google API:', error);
          reject(error);
        }
      });
    });
  },

  restoreSavedToken() {
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
      gapi.client.setToken({ access_token: accessToken });
      this.isSignedIn = true;
      return true;
    }
    return false;
  },

  checkTokenRefresh() {
    if (this.isSignedIn && tokenExpiry && Date.now() > tokenExpiry - 600000) {
      console.log('Token expiring soon, refreshing...');
      tokenClient.requestAccessToken({ prompt: '' });
    }
  },

  async validateToken() {
    try {
      await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: DataConfig.SHEET_ID,
        fields: 'spreadsheetId'
      });
      return true;
    } catch (e) {
      console.log('Token validation failed:', e?.result?.error?.code || e.message);
      return false;
    }
  },

  async refreshTokenAndRetry(operation) {
    return new Promise((resolve, reject) => {
      console.log('Attempting token refresh...');
      const originalCallback = tokenClient.callback;
      tokenClient.callback = async (response) => {
        if (response.error) {
          console.error('Token refresh failed:', response);
          tokenClient.callback = originalCallback;
          reject(new Error('Token refresh failed'));
          return;
        }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
        localStorage.setItem('googleAccessToken', accessToken);
        localStorage.setItem('googleTokenExpiry', tokenExpiry.toString());
        gapi.client.setToken({ access_token: accessToken });
        tokenClient.callback = originalCallback;

        try {
          const result = await operation();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  },

  async signIn() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  },

  async signOut() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken);
      accessToken = null;
      tokenExpiry = null;
    }
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
    this.isSignedIn = false;
    this.onSignInChange(false);
  },

  async getFields() {
    try {
      const sheetId = DataConfig.SHEET_ID;
      console.log('Loading fields from sheet:', sheetId);
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${DataConfig.SHEETS.FIELDS}!A2:E1000`
      });
      const rows = response.result.values || [];
      return rows.map(row => ({
        id: row[0], name: row[1],
        boundary: row[2] ? JSON.parse(row[2]) : null,
        acres: parseFloat(row[3]) || 0
      }));
    } catch (e) {
      console.error('getFields error:', e);
      throw e;
    }
  },

  async getSamples() {
    try {
      const sheetId = DataConfig.SHEET_ID;
      console.log('Loading samples from sheet:', sheetId);
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${DataConfig.SHEETS.SAMPLES}!A1:ZZ10000`
      });
      const rows = response.result.values || [];
      if (rows.length < 2) return [];
      const headers = rows[0];
      const samples = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sample = {};
        headers.forEach((header, idx) => {
          const value = row[idx];
          if (header === 'yieldCorrelations' && value) {
            try { sample[header] = JSON.parse(value); } catch (e) { sample[header] = null; }
          } else if (header !== 'sampleId' && header !== 'field' && value) {
            const num = parseFloat(value);
            sample[header] = isNaN(num) ? value : num;
          } else {
            sample[header] = value || '';
          }
        });
        samples.push(sample);
      }
      return samples;
    } catch (e) {
      console.error('getSamples error:', e);
      throw e;
    }
  },

  async getSettings() {
    try {
      const sheetId = DataConfig.SHEET_ID;
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${DataConfig.SHEETS.SETTINGS}!A2:D100`
      });
      const rows = response.result.values || [];
      const settings = {};
      rows.forEach(row => {
        settings[row[0]] = { min: parseFloat(row[1]) || null, target: parseFloat(row[2]) || null, max: parseFloat(row[3]) || null };
      });
      return settings;
    } catch (e) {
      console.error('getSettings error:', e);
      return {};
    }
  }
};

// ========== CLIENT/FARM DATA ==========
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function loadClientsData() {
  try {
    const saved = localStorage.getItem('clientsData');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Error loading clients:', e);
    return [];
  }
}

function saveClientsData(clientsData) {
  try {
    localStorage.setItem('clientsData', JSON.stringify(clientsData));
  } catch (e) {
    console.error('Error saving clients:', e);
  }
}

function loadFarmsData() {
  try {
    const saved = localStorage.getItem('farmsData');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Error loading farms:', e);
    return [];
  }
}

function saveFarmsData(farmsData) {
  try {
    localStorage.setItem('farmsData', JSON.stringify(farmsData));
  } catch (e) {
    console.error('Error saving farms:', e);
  }
}

function loadActiveSelection() {
  return {
    clientId: localStorage.getItem('activeClientId') || 'all',
    farmId: localStorage.getItem('activeFarmId') || 'all'
  };
}

function saveActiveSelection(clientId, farmId) {
  localStorage.setItem('activeClientId', clientId);
  localStorage.setItem('activeFarmId', farmId);
}

function loadFieldBoundaries() {
  try {
    const saved = localStorage.getItem('fieldBoundaries');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.error('Error loading field boundaries:', e);
    return {};
  }
}

function saveFieldBoundaries(boundaries) {
  try {
    localStorage.setItem('fieldBoundaries', JSON.stringify(boundaries));
  } catch (e) {
    console.error('Error saving field boundaries:', e);
  }
}

// ========== DATA MIGRATION ==========
function migrateDataIfNeeded() {
  const dataVersion = localStorage.getItem('dataVersion');
  if (dataVersion === '2') {
    return false;
  }

  console.log('[Migration] Starting migration to version 2...');

  const saved = localStorage.getItem('fieldBoundaries');
  const boundaries = saved ? JSON.parse(saved) : {};

  const hasLegacyBoundaries = Object.keys(boundaries).some(key => {
    const val = boundaries[key];
    return Array.isArray(val) || (val && !val.boundary);
  });

  if (!hasLegacyBoundaries) {
    localStorage.setItem('dataVersion', '2');
    return false;
  }

  const migratedBoundaries = {};
  Object.entries(boundaries).forEach(([fieldName, fieldData]) => {
    if (Array.isArray(fieldData)) {
      migratedBoundaries[fieldName] = {
        boundary: fieldData,
        farmId: '',
        createdAt: new Date().toISOString()
      };
    } else if (fieldData && !fieldData.boundary) {
      migratedBoundaries[fieldName] = {
        boundary: fieldData,
        farmId: '',
        createdAt: new Date().toISOString()
      };
    } else {
      migratedBoundaries[fieldName] = fieldData;
    }
  });

  localStorage.setItem('fieldBoundaries', JSON.stringify(migratedBoundaries));
  localStorage.setItem('activeClientId', 'all');
  localStorage.setItem('activeFarmId', 'all');
  localStorage.setItem('dataVersion', '2');

  console.log('[Migration] Complete');
  return true;
}

// ========== HELPER FUNCTIONS ==========
function getActiveFields(fieldBoundaries, farmsData, activeClientId, activeFarmId) {
  const allFieldNames = Object.keys(fieldBoundaries);

  if (activeClientId === 'all' && activeFarmId === 'all') {
    return allFieldNames;
  }

  if (activeFarmId !== 'all') {
    return allFieldNames.filter(fieldName => {
      const field = fieldBoundaries[fieldName];
      return field && field.farmId === activeFarmId;
    });
  }

  if (activeClientId !== 'all') {
    const clientFarmIds = farmsData
      .filter(f => f.clientId === activeClientId)
      .map(f => f.id);
    return allFieldNames.filter(fieldName => {
      const field = fieldBoundaries[fieldName];
      return field && clientFarmIds.includes(field.farmId);
    });
  }

  return allFieldNames;
}

function getFieldBoundaryCoords(fieldBoundaries, fieldName) {
  const field = fieldBoundaries[fieldName];
  if (!field) return null;
  return field.boundary || field;
}

function extractSheetId(input) {
  if (input.includes('docs.google.com') || input.includes('/d/')) {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
  }
  return input;
}

function isNewUser() {
  const sheetId = localStorage.getItem('googleSheetId');
  const hasLocalData = localStorage.getItem('soilSamples');
  return !sheetId && !hasLocalData;
}

// ========== EXPORT AS GLOBAL ==========
window.DataCore = {
  // Config
  config: DataConfig,

  // Sheets API
  SheetsAPI: SheetsAPI,

  // IndexedDB
  openDB,
  loadFromIndexedDB,
  saveToIndexedDB,
  loadYieldFromIndexedDB,
  saveYieldToIndexedDB,

  // Client/Farm data
  generateId,
  loadClientsData,
  saveClientsData,
  loadFarmsData,
  saveFarmsData,
  loadActiveSelection,
  saveActiveSelection,
  loadFieldBoundaries,
  saveFieldBoundaries,

  // Migration
  migrateDataIfNeeded,

  // Helpers
  getActiveFields,
  getFieldBoundaryCoords,
  extractSheetId,
  isNewUser
};

})();
