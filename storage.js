/**
 * Local Storage and Meal Plan State Manager
 * Handles multi-week meal planning persistence and shopping list state
 */
class StorageService {
  constructor(config = window.CONFIG) {
    this.config = config;
  }

  /**
   * Calculate ISO 8601 week string: YYYY-Www (e.g. 2026-W46)
   */
  getWeekKey(d = new Date()) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number (make Sunday day 7)
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    const weekStr = weekNo < 10 ? '0' + weekNo : String(weekNo);
    return `${date.getUTCFullYear()}-W${weekStr}`;
  }

  /**
   * Get the Monday Date of a given week key
   */
  getMondayOfWeek(weekKey) {
    const parts = weekKey.split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);

    // 4th January is always in week 1
    const simple = new Date(year, 0, 4);
    const dayOfWeek = simple.getDay() || 7;
    const mondayWeek1 = new Date(simple);
    mondayWeek1.setDate(simple.getDate() - dayOfWeek + 1);

    const targetMonday = new Date(mondayWeek1);
    targetMonday.setDate(mondayWeek1.getDate() + (week - 1) * 7);
    targetMonday.setHours(0, 0, 0, 0);
    return targetMonday;
  }

  /**
   * Get date objects for all 7 days of the week starting Monday
   */
  getDaysOfWeek(weekKey) {
    const monday = this.getMondayOfWeek(weekKey);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }

  /**
   * Move weekKey by deltaWeeks (-1, +1)
   */
  offsetWeek(weekKey, delta) {
    const monday = this.getMondayOfWeek(weekKey);
    monday.setDate(monday.getDate() + (delta * 7));
    return this.getWeekKey(monday);
  }

  /**
   * Format human readable week range: "Nov 9 – Nov 15, 2026"
   */
  formatWeekRange(weekKey) {
    const days = this.getDaysOfWeek(weekKey);
    const mon = days[0];
    const sun = days[6];

    const monMonth = mon.toLocaleDateString(undefined, { month: 'short' });
    const sunMonth = sun.toLocaleDateString(undefined, { month: 'short' });
    const year = sun.getFullYear();

    if (monMonth === sunMonth) {
      return `${monMonth} ${mon.getDate()} – ${sun.getDate()}, ${year}`;
    }
    return `${monMonth} ${mon.getDate()} – ${sunMonth} ${sun.getDate()}, ${year}`;
  }

  /**
   * Load all plans object
   */
  getAllPlans() {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.MEAL_PLANS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('Failed to parse meal plans from localStorage:', e);
      return {};
    }
  }

  /**
   * Save all plans object
   */
  saveAllPlans(plans) {
    try {
      localStorage.setItem(this.config.STORAGE_KEYS.MEAL_PLANS, JSON.stringify(plans));
    } catch (e) {
      console.warn('Failed to save meal plans to localStorage:', e);
    }
  }

  /**
   * Get plan for specific week
   */
  getWeekPlan(weekKey) {
    const all = this.getAllPlans();
    return all[weekKey] || {};
  }

  /**
   * Set meal for a specific week, day, mealType
   */
  setMeal(weekKey, day, mealType, recipe) {
    const all = this.getAllPlans();
    if (!all[weekKey]) all[weekKey] = {};
    if (!all[weekKey][day]) all[weekKey][day] = {};

    all[weekKey][day][mealType] = {
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      categoryNormalized: recipe.categoryNormalized,
      ingredients: recipe.ingredients,
      ingredientsRaw: recipe.ingredientsRaw,
      notes: recipe.notes,
      addedAt: new Date().toISOString()
    };

    this.saveAllPlans(all);
    return all[weekKey];
  }

  /**
   * Remove a meal from the planner
   */
  removeMeal(weekKey, day, mealType) {
    const all = this.getAllPlans();
    if (all[weekKey] && all[weekKey][day] && all[weekKey][day][mealType]) {
      delete all[weekKey][day][mealType];
      this.saveAllPlans(all);
    }
    return all[weekKey] || {};
  }

  /**
   * Clear an entire week's meal plan
   */
  clearWeek(weekKey) {
    const all = this.getAllPlans();
    if (all[weekKey]) {
      delete all[weekKey];
      this.saveAllPlans(all);
    }
  }

  /**
   * Get flat list of all scheduled meals in a week
   */
  getScheduledMeals(weekKey) {
    const weekPlan = this.getWeekPlan(weekKey);
    const list = [];

    this.config.DAYS.forEach(day => {
      const dayPlan = weekPlan[day];
      if (!dayPlan) return;

      this.config.MEAL_TYPES.forEach(mealType => {
        const recipe = dayPlan[mealType];
        if (recipe) {
          list.push({
            day,
            dayLabel: this.config.DAY_LABELS[day],
            mealType,
            mealTypeLabel: this.config.MEAL_TYPE_LABELS[mealType],
            recipe
          });
        }
      });
    });

    return list;
  }

  /**
   * Checked items in shopping list
   */
  getCheckedShopping(weekKey) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CHECKED_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      return all[weekKey] || {};
    } catch (e) {
      return {};
    }
  }

  toggleCheckedShopping(weekKey, itemKey, isChecked) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CHECKED_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      if (!all[weekKey]) all[weekKey] = {};
      all[weekKey][itemKey] = isChecked;
      localStorage.setItem(this.config.STORAGE_KEYS.CHECKED_SHOPPING, JSON.stringify(all));
      return all[weekKey];
    } catch (e) {
      return {};
    }
  }

  clearCheckedShopping(weekKey) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CHECKED_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      if (all[weekKey]) {
        delete all[weekKey];
        localStorage.setItem(this.config.STORAGE_KEYS.CHECKED_SHOPPING, JSON.stringify(all));
      }
    } catch (e) {}
  }

  /**
   * Custom items in shopping list
   */
  getCustomShopping(weekKey) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      return all[weekKey] || [];
    } catch (e) {
      return [];
    }
  }

  addCustomShopping(weekKey, name, category = 'other') {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      if (!all[weekKey]) all[weekKey] = [];
      const item = {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: name.trim(),
        category,
        checked: false,
        addedAt: new Date().toISOString()
      };
      all[weekKey].push(item);
      localStorage.setItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING, JSON.stringify(all));
      return all[weekKey];
    } catch (e) {
      return [];
    }
  }

  toggleCustomShopping(weekKey, itemId, checked) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      if (all[weekKey]) {
        const item = all[weekKey].find(i => i.id === itemId);
        if (item) item.checked = checked;
        localStorage.setItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING, JSON.stringify(all));
      }
    } catch (e) {}
  }

  removeCustomShopping(weekKey, itemId) {
    try {
      const raw = localStorage.getItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING);
      const all = raw ? JSON.parse(raw) : {};
      if (all[weekKey]) {
        all[weekKey] = all[weekKey].filter(i => i.id !== itemId);
        localStorage.setItem(this.config.STORAGE_KEYS.CUSTOM_SHOPPING, JSON.stringify(all));
        return all[weekKey];
      }
    } catch (e) {
      return [];
    }
  }
}

window.StorageService = StorageService;
