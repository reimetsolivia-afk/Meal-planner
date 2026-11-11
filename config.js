/**
 * Application Configuration
 */
const CONFIG = {
  // Google Spreadsheet configuration from user request
  // Link: https://docs.google.com/spreadsheets/d/1Tx7Z1OhNKXpwp2Im3zq-xOdiDRM_FReswbRLwyDExXU/edit?gid=0#gid=0
  SHEET_ID: '1Tx7Z1OhNKXpwp2Im3zq-xOdiDRM_FReswbRLwyDExXU',
  SHEET_GID: '0',
  SHEET_NAME: 'Sheet1',
  
  // Storage keys for localStorage persistence
  STORAGE_KEYS: {
    RECIPES_CACHE: 'meal_planner_recipes_cache',
    LAST_SYNC: 'meal_planner_last_sync',
    MEAL_PLANS: 'meal_planner_weekly_plans',
    CHECKED_SHOPPING: 'meal_planner_checked_shopping',
    CUSTOM_SHOPPING: 'meal_planner_custom_shopping',
    SETTINGS: 'meal_planner_settings'
  },

  // Meal types defined in requirements
  MEAL_TYPES: ['breakfast', 'lunch', 'dinner'],
  MEAL_TYPE_LABELS: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner'
  },

  // Days of week starting Monday
  DAYS: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  DAY_LABELS: {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  }
};

window.CONFIG = CONFIG;
