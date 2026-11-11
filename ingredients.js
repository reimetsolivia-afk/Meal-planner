/**
 * Ingredient Parser and Categorizer
 * Groups, deduplicates, and organizes ingredients for the shopping list
 */
class IngredientService {
  constructor() {
    // Categories and keyword matchers
    this.CATEGORY_RULES = [
      {
        id: 'produce',
        name: 'Fresh Produce & Herbs',
        icon: '🌱',
        keywords: [
          'garlic', 'onion', 'shallot', 'cucumber', 'chilli', 'chili', 'pepper', 'bell pepper',
          'tomato', 'potato', 'potatoes', 'carrot', 'carrots', 'spinach', 'lettuce', 'greens',
          'lemon', 'lime', 'avocado', 'ginger', 'mushroom', 'mushrooms', 'zucchini', 'eggplant',
          'parsley', 'basil', 'cilantro', 'coriander', 'mint', 'rosemary', 'thyme', 'dill',
          'scallion', 'scallions', 'spring onion', 'green onion', 'broccoli', 'cauliflower',
          'apple', 'banana', 'berry', 'berries', 'cabbage', 'celery', 'kale', 'corn'
        ]
      },
      {
        id: 'dairy_eggs',
        name: 'Dairy & Eggs',
        icon: '🥚',
        keywords: [
          'egg', 'eggs', 'butter', 'cream', 'heavy cream', 'sour cream', 'milk', 'cheese',
          'parmesan', 'cheddar', 'mozzarella', 'feta', 'ricotta', 'yogurt', 'yoghurt',
          'ghee', 'brie', 'mascarpone', 'paneer'
        ]
      },
      {
        id: 'meat_seafood',
        name: 'Meat & Seafood',
        icon: '🥩',
        keywords: [
          'chicken', 'chicken breast', 'chicken thigh', 'bacon', 'shrimp', 'prawn', 'prawns',
          'beef', 'ground beef', 'mince', 'steak', 'pork', 'sausage', 'salmon', 'tuna',
          'fish', 'turkey', 'ham', 'lamb', 'prosciutto', 'anchovy', 'cod', 'halibut'
        ]
      },
      {
        id: 'bakery',
        name: 'Bakery & Bread',
        icon: '🍞',
        keywords: [
          'bread', 'toast', 'sourdough', 'baguette', 'tortilla', 'tortillas', 'pita',
          'bagel', 'bun', 'buns', 'croissant', 'wrap', 'wraps', 'english muffin'
        ]
      },
      {
        id: 'pantry',
        name: 'Pantry, Grains & Spices',
        icon: '🧂',
        keywords: [
          'rice', 'pasta', 'spaghetti', 'penne', 'noodles', 'flour', 'sugar', 'salt', 'pepper',
          'black pepper', 'soy sauce', 'oil', 'olive oil', 'vegetable oil', 'sesame oil',
          'vinegar', 'balsamic', 'mustard', 'mayo', 'mayonnaise', 'ketchup', 'honey', 'syrup',
          'sauce', 'tomato sauce', 'tomato paste', 'broth', 'stock', 'beans', 'lentils',
          'chickpeas', 'cumin', 'paprika', 'oregano', 'cinnamon', 'curry', 'turmeric'
        ]
      }
    ];
  }

  /**
   * Normalize an ingredient name for grouping
   */
  normalizeIngredient(str) {
    if (!str) return '';
    let cleaned = str.toLowerCase().trim();
    // Remove amounts, parentheses extra notes like "(optional)"
    cleaned = cleaned.replace(/\(.*?\)/g, '').trim();
    // Remove leading numbers / quantities (e.g. "2 cloves garlic" -> "garlic")
    cleaned = cleaned.replace(/^[\d\s\/\.,\-\½\¼\¾]+(cups?|tbsp|tsp|tablespoons?|teaspoons?|grams?|g|kg|ml|oz|lbs?|cloves?|slices?|pinch(es)?)?\s*(of\s*)?/i, '').trim();
    // Simple plural to singular for common items
    if (cleaned === 'eggs') return 'egg';
    if (cleaned === 'onions') return 'onion';
    if (cleaned === 'tomatoes') return 'tomato';
    if (cleaned === 'potatoes') return 'potato';
    if (cleaned === 'carrots') return 'carrot';
    if (cleaned === 'mushrooms') return 'mushroom';
    if (cleaned === 'prawns') return 'prawn';
    return cleaned;
  }

  /**
   * Format display title (e.g. capitalize)
   */
  formatDisplayName(normalized, originalRaw) {
    if (!normalized) return originalRaw || '';
    // Capitalize first letter
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  /**
   * Determine the best category for an ingredient
   */
  categorizeIngredient(rawName, normalizedName) {
    const text = (normalizedName + ' ' + rawName).toLowerCase();

    for (const cat of this.CATEGORY_RULES) {
      for (const kw of cat.keywords) {
        // Check for whole word or prefix match
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(text)) {
          return cat;
        }
      }
    }

    return {
      id: 'other',
      name: 'Other & Sundries',
      icon: '🛒',
      keywords: []
    };
  }

  /**
   * Generate shopping list from scheduled meals
   * @param {Array} scheduledMeals - Array of { day, mealType, recipe }
   * @param {Object} checkedItems - Map of ingredient key -> boolean
   * @param {Array} customItems - Array of { id, name, category, checked }
   */
  generateShoppingList(scheduledMeals, checkedItems = {}, customItems = []) {
    const ingredientMap = new Map();

    // Process all scheduled meals
    scheduledMeals.forEach(({ day, mealType, recipe }) => {
      if (!recipe || !recipe.ingredients) return;

      recipe.ingredients.forEach(rawItem => {
        const rawTrimmed = rawItem.trim();
        if (!rawTrimmed) return;

        const normalized = this.normalizeIngredient(rawTrimmed);
        const key = normalized || rawTrimmed.toLowerCase();

        if (!ingredientMap.has(key)) {
          const cat = this.categorizeIngredient(rawTrimmed, normalized);
          ingredientMap.set(key, {
            id: 'item_' + key.replace(/\W+/g, '_'),
            key: key,
            displayName: this.formatDisplayName(normalized, rawTrimmed),
            category: cat.id,
            categoryName: cat.name,
            categoryIcon: cat.icon,
            sources: [],
            count: 0,
            originalVariants: new Set(),
            isChecked: !!checkedItems[key]
          });
        }

        const entry = ingredientMap.get(key);
        entry.count += 1;
        entry.originalVariants.add(rawTrimmed);
        // Track which recipe and day it came from
        const sourceLabel = `${recipe.name}`;
        if (!entry.sources.includes(sourceLabel)) {
          entry.sources.push(sourceLabel);
        }
      });
    });

    // Merge custom user items
    customItems.forEach(item => {
      const key = 'custom_' + item.id;
      const cat = this.categorizeIngredient(item.name, item.name.toLowerCase());
      ingredientMap.set(key, {
        id: item.id,
        key: key,
        displayName: item.name,
        category: item.category || cat.id,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        sources: ['Custom Item'],
        count: 1,
        isCustom: true,
        isChecked: !!item.checked
      });
    });

    // Group by category in canonical order
    const categoryOrder = [
      'produce',
      'dairy_eggs',
      'meat_seafood',
      'bakery',
      'pantry',
      'other'
    ];

    const categoryGroups = [];
    const grouped = {};

    categoryOrder.forEach(catId => {
      const rule = this.CATEGORY_RULES.find(r => r.id === catId) || {
        id: 'other',
        name: 'Other & Sundries',
        icon: '🛒'
      };
      grouped[catId] = {
        id: rule.id,
        name: rule.name,
        icon: rule.icon,
        items: []
      };
    });

    // Populate groups
    ingredientMap.forEach(item => {
      const catId = grouped[item.category] ? item.category : 'other';
      grouped[catId].items.push(item);
    });

    // Sort items alphabetically within categories, put non-empty categories in list
    categoryOrder.forEach(catId => {
      const group = grouped[catId];
      if (group.items.length > 0) {
        group.items.sort((a, b) => a.displayName.localeCompare(b.displayName));
        categoryGroups.push(group);
      }
    });

    // Compute summary stats
    let totalItems = 0;
    let checkedCount = 0;

    ingredientMap.forEach(item => {
      totalItems += 1;
      if (item.isChecked) checkedCount += 1;
    });

    return {
      categoryGroups,
      totalItems,
      checkedCount,
      allEmpty: totalItems === 0
    };
  }
}

window.IngredientService = IngredientService;
