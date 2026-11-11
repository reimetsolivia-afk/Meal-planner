/**
 * Google Sheets Data Service
 * Connects directly to Google Spreadsheet to fetch recipe database dynamically.
 */
class GoogleSheetsService {
  constructor(config = window.CONFIG) {
    this.config = config;
    this.recipes = [];
    this.lastSyncTime = null;
    this.syncStatus = 'idle'; // 'idle' | 'loading' | 'success' | 'error'
    this.errorMessage = null;
    this.listeners = new Set();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach(fn => {
      try {
        fn({
          recipes: this.recipes,
          status: this.syncStatus,
          lastSyncTime: this.lastSyncTime,
          errorMessage: this.errorMessage
        });
      } catch (err) {
        console.error('Error in sheets listener:', err);
      }
    });
  }

  /**
   * Get current sheet configuration
   */
  getSheetConfig() {
    const saved = localStorage.getItem(this.config.STORAGE_KEYS.SETTINGS);
    let customConfig = {};
    if (saved) {
      try {
        customConfig = JSON.parse(saved);
      } catch (e) {}
    }
    return {
      sheetId: customConfig.sheetId || this.config.SHEET_ID,
      gid: customConfig.gid !== undefined ? customConfig.gid : this.config.SHEET_GID
    };
  }

  /**
   * Save customized sheet ID if user changes it
   */
  updateSheetConfig(sheetId, gid = '0') {
    const settings = { sheetId: sheetId.trim(), gid: String(gid).trim() };
    localStorage.setItem(this.config.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return this.fetchRecipes(true);
  }

  /**
   * Fetch recipes from Google Sheets
   * Uses JSONP first (bypasses CORS restrictions in browsers), then fetch fallbacks
   */
  async fetchRecipes(forceRefresh = false) {
    this.syncStatus = 'loading';
    this.errorMessage = null;
    this.notify();

    // 1. Check local cache first if not forced
    if (!forceRefresh) {
      const cached = this.loadFromCache();
      if (cached && cached.length > 0) {
        this.recipes = cached;
        this.syncStatus = 'success';
        this.notify();
        // Continue to fetch in background to verify latest changes
      }
    }

    const { sheetId, gid } = this.getSheetConfig();

    try {
      // Primary method: JSONP via Google Visualization API
      const rawData = await this.fetchViaJsonp(sheetId, gid);
      const parsedRecipes = this.parseGvizResponse(rawData);

      if (!parsedRecipes || parsedRecipes.length === 0) {
        throw new Error('No recipes found in the spreadsheet. Please ensure the sheet has rows.');
      }

      this.recipes = parsedRecipes;
      this.lastSyncTime = new Date();
      this.syncStatus = 'success';
      this.errorMessage = null;

      // Persist to cache
      this.saveToCache(this.recipes, this.lastSyncTime);
      this.notify();
      return this.recipes;
    } catch (primaryErr) {
      console.warn('JSONP fetch failed, attempting CSV fallback fetch...', primaryErr);

      try {
        // Fallback: direct fetch CSV / gviz
        const csvRecipes = await this.fetchViaCsv(sheetId, gid);
        if (csvRecipes && csvRecipes.length > 0) {
          this.recipes = csvRecipes;
          this.lastSyncTime = new Date();
          this.syncStatus = 'success';
          this.errorMessage = null;
          this.saveToCache(this.recipes, this.lastSyncTime);
          this.notify();
          return this.recipes;
        }
      } catch (fallbackErr) {
        console.warn('Fallback CSV fetch failed as well:', fallbackErr);
      }

      // If network fails but we have cache:
      const cached = this.loadFromCache();
      if (cached && cached.length > 0) {
        this.recipes = cached;
        this.syncStatus = 'warning';
        this.errorMessage = `Could not refresh live from Google Sheets (${primaryErr.message || 'Network restricted'}). Displaying previously cached recipes.`;
        this.notify();
        return this.recipes;
      }

      // No cache and failed
      this.syncStatus = 'error';
      this.errorMessage = primaryErr.message || 'Unable to load recipes from Google Sheets. Please check your connection and sheet link.';
      this.notify();
      throw primaryErr;
    }
  }

  /**
   * Fetch using dynamic JSONP script tag
   * This technique executes client-side without CORS headers from Google
   */
  fetchViaJsonp(sheetId, gid) {
    return new Promise((resolve, reject) => {
      const callbackName = 'gvizCallback_' + Math.floor(Math.random() * 1000000);
      const timeoutMs = 12000;
      let timer = null;

      // Clean up script tag & callback
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (window[callbackName]) {
          delete window[callbackName];
        }
        const script = document.getElementById(callbackName);
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };

      // Set timeout
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Connection to Google Sheets timed out after 12 seconds.'));
      }, timeoutMs);

      // Define callback on window
      window[callbackName] = (response) => {
        cleanup();
        if (!response || !response.table) {
          reject(new Error(response?.errors?.[0]?.message || 'Invalid response received from Google Sheets API'));
          return;
        }
        resolve(response);
      };

      // Create script element
      const script = document.createElement('script');
      script.id = callbackName;
      // Add cache buster to prevent stale response when user updates Google Sheet
      const cacheBuster = `&_t=${Date.now()}`;
      script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${encodeURIComponent(gid)}${cacheBuster}`;

      script.onerror = () => {
        cleanup();
        reject(new Error('Failed to load Google Sheets script. Sheet may not be public or network is unavailable.'));
      };

      document.body.appendChild(script);
    });
  }

  /**
   * Fallback fetch via CSV endpoint
   */
  async fetchViaCsv(sheetId, gid) {
    const urls = [
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}&_t=${Date.now()}`,
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}&_t=${Date.now()}`
    ];

    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const csvText = await res.text();
          return this.parseCsv(csvText);
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('CSV fetch failed');
  }

  /**
   * Parse GViz API response object
   */
  parseGvizResponse(data) {
    const table = data.table;
    if (!table || !table.rows) return [];

    const rows = table.rows;
    if (rows.length === 0) return [];

    // Find column mapping
    // Google Sheets gviz may have first row as headers, or cols labels
    let headerRowIndex = -1;
    let colMap = { recipe: -1, category: -1, ingredients: -1, notes: -1 };

    // Check cols labels first
    if (table.cols && table.cols.some(c => c.label)) {
      table.cols.forEach((col, idx) => {
        const label = (col.label || '').toLowerCase().trim();
        if (label.includes('recipe') || label.includes('name') || label.includes('title')) colMap.recipe = idx;
        else if (label.includes('category') || label.includes('type')) colMap.category = idx;
        else if (label.includes('ingredient')) colMap.ingredients = idx;
        else if (label.includes('note') || label.includes('instruction') || label.includes('desc')) colMap.notes = idx;
      });
    }

    // If headers not found in cols, check first row
    if (colMap.recipe === -1 && rows.length > 0) {
      const firstRowValues = rows[0].c.map(cell => (cell && cell.v !== null && cell.v !== undefined) ? String(cell.v).toLowerCase().trim() : '');
      let hasHeaderMatch = false;
      firstRowValues.forEach((val, idx) => {
        if (val.includes('recipe') || val.includes('name') || val.includes('title')) {
          colMap.recipe = idx;
          hasHeaderMatch = true;
        } else if (val.includes('category') || val.includes('type')) {
          colMap.category = idx;
          hasHeaderMatch = true;
        } else if (val.includes('ingredient')) {
          colMap.ingredients = idx;
          hasHeaderMatch = true;
        } else if (val.includes('note') || val.includes('instruction') || val.includes('desc')) {
          colMap.notes = idx;
          hasHeaderMatch = true;
        }
      });
      if (hasHeaderMatch) {
        headerRowIndex = 0;
      }
    }

    // Default column fallback if not named (col A: recipe, col B: category, col C: ingredients, col D: notes)
    if (colMap.recipe === -1) colMap.recipe = 0;
    if (colMap.category === -1) colMap.category = 1;
    if (colMap.ingredients === -1) colMap.ingredients = 2;
    if (colMap.notes === -1) colMap.notes = 3;

    const recipes = [];
    const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
      const c = rows[i].c;
      if (!c) continue;

      const getVal = (idx) => {
        if (idx === -1 || !c[idx] || c[idx].v === null || c[idx].v === undefined) return '';
        return String(c[idx].v).trim();
      };

      const name = getVal(colMap.recipe);
      // Skip empty rows or accidental header duplicate
      if (!name || name.toLowerCase() === 'recipe') continue;

      const category = getVal(colMap.category) || 'General';
      const ingredientsRaw = getVal(colMap.ingredients);
      const notes = getVal(colMap.notes);

      const ingredientsList = this.splitIngredients(ingredientsRaw);

      recipes.push({
        id: this.slugify(name) + '_' + i,
        name: name,
        category: category,
        categoryNormalized: this.normalizeCategory(category),
        ingredientsRaw: ingredientsRaw,
        ingredients: ingredientsList,
        notes: notes
      });
    }

    return recipes;
  }

  /**
   * Parse CSV string
   */
  parseCsv(csvText) {
    const lines = this.parseCsvLines(csvText);
    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.toLowerCase().trim());
    const colMap = {
      recipe: headers.findIndex(h => h.includes('recipe') || h.includes('name') || h.includes('title')),
      category: headers.findIndex(h => h.includes('category') || h.includes('type')),
      ingredients: headers.findIndex(h => h.includes('ingredient')),
      notes: headers.findIndex(h => h.includes('note') || h.includes('desc'))
    };

    if (colMap.recipe === -1) colMap.recipe = 0;
    if (colMap.category === -1) colMap.category = 1;
    if (colMap.ingredients === -1) colMap.ingredients = 2;
    if (colMap.notes === -1) colMap.notes = 3;

    const recipes = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length === 0) continue;

      const name = (row[colMap.recipe] || '').trim();
      if (!name || name.toLowerCase() === 'recipe') continue;

      const category = (row[colMap.category] || 'General').trim();
      const ingredientsRaw = (row[colMap.ingredients] || '').trim();
      const notes = (row[colMap.notes] || '').trim();

      recipes.push({
        id: this.slugify(name) + '_' + i,
        name: name,
        category: category,
        categoryNormalized: this.normalizeCategory(category),
        ingredientsRaw: ingredientsRaw,
        ingredients: this.splitIngredients(ingredientsRaw),
        notes: notes
      });
    }
    return recipes;
  }

  /**
   * Standard CSV line parser that respects quoted commas
   */
  parseCsvLines(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  }

  /**
   * Split comma-separated or newline-separated ingredients
   */
  splitIngredients(raw) {
    if (!raw) return [];
    return raw
      .split(/[,;\n]/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  /**
   * Normalize category for standardized filtering ('breakfast' | 'lunch/dinner' | 'other')
   */
  normalizeCategory(cat) {
    const lower = (cat || '').toLowerCase();
    if (lower.includes('breakfast')) return 'breakfast';
    if (lower.includes('lunch') || lower.includes('dinner')) return 'lunch/dinner';
    return 'other';
  }

  /**
   * Helper slugify
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '_')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
  }

  /**
   * Save recipes to cache
   */
  saveToCache(recipes, time) {
    try {
      localStorage.setItem(this.config.STORAGE_KEYS.RECIPES_CACHE, JSON.stringify(recipes));
      localStorage.setItem(this.config.STORAGE_KEYS.LAST_SYNC, time.toISOString());
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  /**
   * Load recipes from cache
   */
  loadFromCache() {
    try {
      const data = localStorage.getItem(this.config.STORAGE_KEYS.RECIPES_CACHE);
      const time = localStorage.getItem(this.config.STORAGE_KEYS.LAST_SYNC);
      if (time) {
        this.lastSyncTime = new Date(time);
      }
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('LocalStorage read failed:', e);
      return null;
    }
  }
}

window.GoogleSheetsService = GoogleSheetsService;
