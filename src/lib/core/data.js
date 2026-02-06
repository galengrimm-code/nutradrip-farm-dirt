/**
 * data.js - Core data management module (ES module)
 * Handles IndexedDB, localStorage, Google Sheets API, client/farm data
 * Converted from IIFE — all logic preserved identically
 */

import { CLIENT_ID, API_KEY, getSheetId, SHEET_NAMES } from './config.js';

// ========== INDEXEDDB ==========
const DB_NAME = 'SoilAppDB';
const DB_VERSION = 3;

export function openDB() {
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
      if (!db.objectStoreNames.contains('inSeasonAnalysis')) db.createObjectStore('inSeasonAnalysis', { keyPath: 'id' });
    };
  });
}

export async function loadFromIndexedDB() {
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

export async function saveToIndexedDB(samples, boundaries) {
  try {
    const db = await openDB();
    const tx = db.transaction(['samples', 'boundaries'], 'readwrite');
    tx.objectStore('samples').put({ id: 'all', data: samples });
    tx.objectStore('boundaries').put({ id: 'all', data: boundaries });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    db.close();
    localStorage.setItem('usingIndexedDB', 'true');
    return true;
  } catch (e) { console.error('IndexedDB save error:', e); return false; }
}

export async function loadYieldFromIndexedDB() {
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

export async function saveYieldToIndexedDB(yieldData) {
  try {
    const db = await openDB();
    const tx = db.transaction(['yield'], 'readwrite');
    tx.objectStore('yield').put({ id: 'all', data: yieldData });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    db.close();
    return true;
  } catch (e) { console.error('IndexedDB yield save error:', e); return false; }
}

export async function loadInSeasonFromIndexedDB() {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains('inSeasonAnalysis')) { db.close(); return []; }
    const tx = db.transaction(['inSeasonAnalysis'], 'readonly');
    const data = await new Promise((resolve, reject) => {
      const req = tx.objectStore('inSeasonAnalysis').get('all');
      req.onsuccess = () => resolve(req.result?.data || []);
      req.onerror = reject;
    });
    db.close();
    return data;
  } catch (e) { return []; }
}

export async function saveInSeasonToIndexedDB(inSeasonData) {
  try {
    const db = await openDB();
    const tx = db.transaction(['inSeasonAnalysis'], 'readwrite');
    tx.objectStore('inSeasonAnalysis').put({ id: 'all', data: inSeasonData });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    db.close();
    return true;
  } catch (e) { console.error('IndexedDB in-season save error:', e); return false; }
}

// ========== SHEETS API ==========
let tokenClient;
let accessToken = null;
let tokenExpiry = null;
let refreshAttempted = false;

export const SheetsAPI = {
  isInitialized: false,
  isSignedIn: false,
  onSignInChange(isSignedIn) { console.log('Sign-in state:', isSignedIn); },

  async init() {
    return new Promise((resolve, reject) => {
      gapi.load('client:picker', async () => {
        try {
          await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
          });
          this.isInitialized = true;
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
            callback: (response) => {
              if (response.error) { console.error('Token error:', response); return; }
              accessToken = response.access_token;
              tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
              refreshAttempted = false;
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
            gapi.client.setToken({ access_token: accessToken });
            this.isSignedIn = true;
            console.log('[Sheets] Restored saved auth token from localStorage');
          }
          setInterval(() => this.checkTokenRefresh(), 120000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isSignedIn) this.checkTokenRefresh();
          });
          resolve(true);
        } catch (error) { console.error('Error initializing Google API:', error); reject(error); }
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
    if (!this.isSignedIn || !tokenExpiry) return;
    const now = Date.now();
    // Token already expired — clear auth state quietly
    if (now > tokenExpiry) {
      console.log('[Sheets] Token expired, clearing auth state');
      accessToken = null;
      tokenExpiry = null;
      refreshAttempted = false;
      localStorage.removeItem('googleAccessToken');
      localStorage.removeItem('googleTokenExpiry');
      this.isSignedIn = false;
      this.onSignInChange(false);
      return;
    }
    // Token expiring within 30 min — attempt one silent refresh
    if (now > tokenExpiry - 1800000 && !refreshAttempted) {
      refreshAttempted = true;
      console.log('[Sheets] Token expiring soon, attempting refresh...');
      tokenClient.requestAccessToken({ prompt: '' });
    }
  },

  async validateToken() {
    try {
      await gapi.client.sheets.spreadsheets.get({ spreadsheetId: getSheetId(), fields: 'spreadsheetId' });
      return true;
    } catch (e) { console.log('Token validation failed:', e?.result?.error?.code || e.message); return false; }
  },

  async refreshTokenAndRetry(operation) {
    return new Promise((resolve, reject) => {
      console.log('Attempting token refresh...');
      const originalCallback = tokenClient.callback;
      tokenClient.callback = async (response) => {
        if (response.error) { console.error('Token refresh failed:', response); tokenClient.callback = originalCallback; reject(new Error('Token refresh failed')); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
        localStorage.setItem('googleAccessToken', accessToken);
        localStorage.setItem('googleTokenExpiry', tokenExpiry.toString());
        gapi.client.setToken({ access_token: accessToken });
        tokenClient.callback = originalCallback;
        try { const result = await operation(); resolve(result); } catch (e) { reject(e); }
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  },

  async signIn() { tokenClient.requestAccessToken({ prompt: 'consent' }); },

  async signOut() {
    if (accessToken) { google.accounts.oauth2.revoke(accessToken); accessToken = null; tokenExpiry = null; }
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
    this.isSignedIn = false;
    this.onSignInChange(false);
  },

  async getFields() {
    try {
      const sheetId = getSheetId();
      const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_NAMES.FIELDS}!A2:F1000` });
      const rows = response.result.values || [];
      const fields = rows.map((row, idx) => {
        let boundary = null;
        if (row[2]) { try { boundary = JSON.parse(row[2]); } catch (e) { console.warn(`[Sheets] Failed to parse boundary for field "${row[1]}" (row ${idx + 2}):`, e.message); } }
        return { id: row[0], name: row[1], boundary, acres: parseFloat(row[3]) || 0, farmId: row[4] || '' };
      });
      return fields;
    } catch (e) { console.error('getFields error:', e); throw e; }
  },

  async getSamples() {
    try {
      const sheetId = getSheetId();
      const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_NAMES.SAMPLES}!A1:ZZ10000` });
      const rows = response.result.values || [];
      if (rows.length < 2) return [];
      const headers = rows[0];
      const samples = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const sample = {};
        headers.forEach((header, idx) => {
          const value = row[idx];
          if (header === 'yieldCorrelations' && value) { try { sample[header] = JSON.parse(value); } catch (e) { sample[header] = null; } }
          else if (header !== 'sampleId' && header !== 'field' && value) { const num = parseFloat(value); sample[header] = isNaN(num) ? value : num; }
          else { sample[header] = value || ''; }
        });
        samples.push(sample);
      }
      let calculatedRatios = 0;
      samples.forEach(s => {
        if ((s.P_Zn_Ratio === undefined || s.P_Zn_Ratio === null || s.P_Zn_Ratio === '') && s.P !== undefined && s.P !== '' && s.Zn !== undefined && s.Zn !== '' && s.Zn > 0) {
          s.P_Zn_Ratio = s.P / s.Zn; calculatedRatios++;
        }
      });
      if (calculatedRatios > 0) console.log(`[Sheets] Auto-calculated P_Zn_Ratio for ${calculatedRatios} samples`);
      return samples;
    } catch (e) { console.error('getSamples error:', e); throw e; }
  },

  async getSettings() {
    try {
      const sheetId = getSheetId();
      const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SHEET_NAMES.SETTINGS}!A2:D100` });
      const rows = response.result.values || [];
      const settings = {};
      rows.forEach(row => { settings[row[0]] = { min: parseFloat(row[1]) || null, target: parseFloat(row[2]) || null, max: parseFloat(row[3]) || null }; });
      return settings;
    } catch (e) { console.error('getSettings error:', e); return {}; }
  },

  async getInSeasonAnalysis() {
    try {
      const sheetId = getSheetId();
      const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'InSeasonAnalysis!A1:BZ10000' });
      const rows = response.result.values || [];
      if (rows.length < 2) return [];
      const headers = rows[0];
      const records = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        const record = {};
        headers.forEach((header, idx) => {
          const value = row[idx];
          if (value === undefined || value === '') return;
          const stringFields = ['AnalysisID', 'SiteId', 'Type', 'Field', 'Client', 'Farm', 'GrowthStage', 'PlantType', 'Variety', 'LeafAge', 'LabDate', 'Year'];
          if (stringFields.includes(header) || /^\d{4}-\d{2}-\d{2}/.test(value)) record[header] = value;
          else { const num = parseFloat(value); record[header] = isNaN(num) ? value : num; }
        });
        if (Object.keys(record).length > 0) records.push(record);
      }
      return records;
    } catch (e) { console.error('getInSeasonAnalysis error:', e); return []; }
  }
};

// ========== CLIENT/FARM DATA ==========

export function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function loadClientsData() {
  try { const saved = localStorage.getItem('clientsData'); return saved ? JSON.parse(saved) : []; }
  catch (e) { console.error('Error loading clients:', e); return []; }
}

export function saveClientsData(clientsData) {
  try { localStorage.setItem('clientsData', JSON.stringify(clientsData)); }
  catch (e) { console.error('Error saving clients:', e); }
}

export function loadFarmsData() {
  try { const saved = localStorage.getItem('farmsData'); return saved ? JSON.parse(saved) : []; }
  catch (e) { console.error('Error loading farms:', e); return []; }
}

export function saveFarmsData(farmsData) {
  try { localStorage.setItem('farmsData', JSON.stringify(farmsData)); }
  catch (e) { console.error('Error saving farms:', e); }
}

export function loadActiveSelection() {
  return { clientId: localStorage.getItem('activeClientId') || 'all', farmId: localStorage.getItem('activeFarmId') || 'all' };
}

export function saveActiveSelection(clientId, farmId) {
  localStorage.setItem('activeClientId', clientId);
  localStorage.setItem('activeFarmId', farmId);
}

export function loadFieldBoundaries() {
  try { const saved = localStorage.getItem('fieldBoundaries'); return saved ? JSON.parse(saved) : {}; }
  catch (e) { console.error('Error loading field boundaries:', e); return {}; }
}

export function saveFieldBoundaries(boundaries) {
  try { localStorage.setItem('fieldBoundaries', JSON.stringify(boundaries)); }
  catch (e) { console.error('Error saving field boundaries:', e); }
}

// ========== DATA MIGRATION ==========

export function migrateDataIfNeeded() {
  const dataVersion = localStorage.getItem('dataVersion');
  if (dataVersion === '2') return false;
  console.log('[Migration] Starting migration to version 2...');
  const saved = localStorage.getItem('fieldBoundaries');
  const boundaries = saved ? JSON.parse(saved) : {};
  const hasLegacyBoundaries = Object.keys(boundaries).some(key => {
    const val = boundaries[key]; return Array.isArray(val) || (val && !val.boundary);
  });
  if (!hasLegacyBoundaries) { localStorage.setItem('dataVersion', '2'); return false; }
  const migratedBoundaries = {};
  Object.entries(boundaries).forEach(([fieldName, fieldData]) => {
    if (Array.isArray(fieldData)) migratedBoundaries[fieldName] = { boundary: fieldData, farmId: '', createdAt: new Date().toISOString() };
    else if (fieldData && !fieldData.boundary) migratedBoundaries[fieldName] = { boundary: fieldData, farmId: '', createdAt: new Date().toISOString() };
    else migratedBoundaries[fieldName] = fieldData;
  });
  localStorage.setItem('fieldBoundaries', JSON.stringify(migratedBoundaries));
  localStorage.setItem('activeClientId', 'all');
  localStorage.setItem('activeFarmId', 'all');
  localStorage.setItem('dataVersion', '2');
  console.log('[Migration] Complete');
  return true;
}

// ========== GOOGLE PICKER ==========
let pickerCallback = null;
let pendingPickerAfterSignIn = false;

export function openSheetPicker(callback) {
  pickerCallback = callback;
  const token = gapi.client.getToken();
  if (token && token.access_token) { showPicker(); return; }
  pendingPickerAfterSignIn = true;
  const originalOnSignInChange = SheetsAPI.onSignInChange;
  SheetsAPI.onSignInChange = (isSignedIn) => {
    originalOnSignInChange(isSignedIn);
    if (isSignedIn && pendingPickerAfterSignIn) {
      pendingPickerAfterSignIn = false;
      SheetsAPI.onSignInChange = originalOnSignInChange;
      setTimeout(showPicker, 100);
    }
  };
  SheetsAPI.signIn();
}

function showPicker() {
  const token = gapi.client.getToken();
  const accessTokenVal = token?.access_token;
  if (!accessTokenVal) { if (pickerCallback) pickerCallback({ error: 'Please sign in with Google first' }); return; }
  const picker = new google.picker.PickerBuilder()
    .setTitle('Select your Google Sheet')
    .addView(google.picker.ViewId.SPREADSHEETS)
    .setOAuthToken(accessTokenVal)
    .setDeveloperKey(API_KEY)
    .setCallback(handlePickerSelection)
    .setOrigin(window.location.origin)
    .build();
  picker.setVisible(true);
}

function handlePickerSelection(data) {
  if (data.action === google.picker.Action.PICKED) {
    const sheetId = data.docs[0].id;
    const sheetName = data.docs[0].name;
    localStorage.setItem('googleSheetId', sheetId);
    localStorage.setItem('googleSheetName', sheetName);
    localStorage.setItem('pickerAuthorized', 'true');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('sheet', sheetId);
    window.history.replaceState({}, '', newUrl);
    if (pickerCallback) pickerCallback({ success: true, sheetId, sheetName });
  } else if (data.action === google.picker.Action.CANCEL) {
    if (pickerCallback) pickerCallback({ cancelled: true });
  }
}

export function needsMigration() {
  const savedSheetId = localStorage.getItem('googleSheetId');
  const hasReauthorized = localStorage.getItem('pickerAuthorized');
  return savedSheetId && !hasReauthorized;
}

export async function createNewSheet(operationName) {
  const token = gapi.client.getToken();
  if (!token || !token.access_token) {
    await new Promise((resolve) => {
      const originalCallback = SheetsAPI.onSignInChange;
      SheetsAPI.onSignInChange = (isSignedIn) => { originalCallback(isSignedIn); if (isSignedIn) { SheetsAPI.onSignInChange = originalCallback; resolve(); } };
      SheetsAPI.signIn();
    });
  }
  const sheetTitle = operationName ? `${operationName} - Soil Analysis` : 'Nutradrip - Soil Analysis';
  const response = await gapi.client.sheets.spreadsheets.create({
    properties: { title: sheetTitle },
    sheets: [
      { properties: { title: 'Samples', index: 0 } },
      { properties: { title: 'Fields', index: 1 } },
      { properties: { title: 'Settings', index: 2 } },
      { properties: { title: 'YieldData', index: 3 } },
      { properties: { title: 'SampleSites', index: 4 } }
    ]
  });
  const sheetId = response.result.spreadsheetId;
  const sheetName = response.result.properties.title;
  await initializeSheetHeaders(sheetId);
  localStorage.setItem('googleSheetId', sheetId);
  localStorage.setItem('googleSheetName', sheetName);
  localStorage.setItem('pickerAuthorized', 'true');
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('sheet', sheetId);
  window.history.replaceState({}, '', newUrl);
  return { sheetId, sheetName };
}

async function initializeSheetHeaders(sheetId) {
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId, range: 'Samples!A1:Z1', valueInputOption: 'RAW',
    resource: { values: [['SampleID', 'Client', 'Farm', 'Field', 'Lat', 'Lng', 'SampleDate', 'pH', 'P_ppm', 'K_ppm', 'Zn_ppm', 'OM_pct', 'CEC', 'Ca_ppm', 'Mg_ppm', 'S_ppm', 'Mn_ppm', 'Fe_ppm', 'Cu_ppm', 'B_ppm', 'pct_K', 'pct_Mg', 'pct_Ca']] }
  });
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId, range: 'Fields!A1:J1', valueInputOption: 'RAW',
    resource: { values: [['FieldID', 'Client', 'Farm', 'FieldName', 'Acres', 'Geometry', 'Notes', 'CreatedDate']] }
  });
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId, range: 'Settings!A1:B1', valueInputOption: 'RAW',
    resource: { values: [['Key', 'Value']] }
  });
}

// ========== HELPER FUNCTIONS ==========

export function getActiveFields(fieldBoundaries, farmsData, activeClientId, activeFarmId) {
  const allFieldNames = Object.keys(fieldBoundaries);
  if (activeClientId === 'all' && activeFarmId === 'all') return allFieldNames;
  if (activeFarmId !== 'all') return allFieldNames.filter(fn => { const f = fieldBoundaries[fn]; return f && f.farmId === activeFarmId; });
  if (activeClientId !== 'all') {
    const clientFarmIds = farmsData.filter(f => f.clientId === activeClientId).map(f => f.id);
    return allFieldNames.filter(fn => { const f = fieldBoundaries[fn]; return f && clientFarmIds.includes(f.farmId); });
  }
  return allFieldNames;
}

export function getFieldBoundaryCoords(fieldBoundaries, fieldName) {
  const field = fieldBoundaries[fieldName];
  if (!field) return null;
  return field.boundary || field;
}

export function extractSheetId(input) {
  if (input.includes('docs.google.com') || input.includes('/d/')) {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
  }
  return input;
}

export function isNewUser() {
  const sheetId = localStorage.getItem('googleSheetId');
  const hasLocalData = localStorage.getItem('soilSamples');
  return !sheetId && !hasLocalData;
}
