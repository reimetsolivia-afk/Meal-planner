/**
 * Weekly Meal Planner Application Controller
 * Orchestrates views, state, Google Sheets integration, and user interactions.
 */

class MealPlannerApp {
  constructor() {
    this.sheetsService = new GoogleSheetsService(window.CONFIG);
    this.ingredientService = new IngredientService();
    this.storageService = new StorageService(window.CONFIG);

    // Active state
    this.currentWeekKey = this.storageService.getWeekKey(new Date());
    this.activeTab = 'planner';
    this.recipes = [];
    this.activeCategoryFilter = 'all';
    this.recipeSearchQuery = '';
    
    // Modal state for picking recipes
    this.pickerTarget = { day: null, mealType: null };
    this.selectedRecipeForPlan = null;
    this.currentSurpriseRecipe = null;
    this.surpriseFilterType = 'any';

    this.init();
  }

  /**
   * Initialize application
   */
  async init() {
    this.bindDomElements();
    this.bindEvents();

    // Subscribe to Google Sheets updates
    this.sheetsService.subscribe((state) => {
      this.handleSheetsStateChange(state);
    });

    // Initial render of planner structure
    this.renderWeekNavigation();
    this.renderWeeklyPlanner();
    this.updateDashboard();
    this.renderShoppingList();

    // Fetch recipes from Google Sheets (loads from cache first, then syncs live)
    try {
      await this.sheetsService.fetchRecipes(false);
    } catch (err) {
      console.warn('Initial sheets fetch encountered error, fallback handled:', err);
    }
  }

  /**
   * Cache DOM references
   */
  bindDomElements() {
    // Navigation
    this.navTabs = document.querySelectorAll('.nav-tab');
    this.viewSections = {
      planner: document.getElementById('view-planner'),
      recipes: document.getElementById('view-recipes'),
      shopping: document.getElementById('view-shopping')
    };

    // Header & Actions
    this.btnRefreshSheets = document.getElementById('btn-refresh-sheets');
    this.syncBtnLabel = document.getElementById('sync-btn-label');
    this.btnOpenSurprise = document.getElementById('btn-open-surprise');
    this.btnOpenSettings = document.getElementById('btn-open-settings');
    this.syncDot = document.getElementById('sync-dot');
    this.syncStatusText = document.getElementById('sync-status-text');

    // Dashboard
    this.dashPlannedMeals = document.getElementById('dash-planned-meals');
    this.dashUniqueRecipes = document.getElementById('dash-unique-recipes');
    this.dashShoppingItems = document.getElementById('dash-shopping-items');
    this.navRecipesCount = document.getElementById('nav-recipes-count');
    this.navShoppingCount = document.getElementById('nav-shopping-count');

    // Planner View
    this.weekDisplayTitle = document.getElementById('week-display-title');
    this.weekDisplayDates = document.getElementById('week-display-dates');
    this.btnPrevWeek = document.getElementById('btn-prev-week');
    this.btnNextWeek = document.getElementById('btn-next-week');
    this.btnTodayWeek = document.getElementById('btn-today-week');
    this.btnClearWeek = document.getElementById('btn-clear-week');
    this.weeklyCalendarGrid = document.getElementById('weekly-calendar-grid');

    // Recipes View
    this.recipeSearchInput = document.getElementById('recipe-search-input');
    this.btnClearSearch = document.getElementById('btn-clear-search');
    this.recipeFilterPills = document.getElementById('recipe-filter-pills');
    this.recipeCountIndicator = document.getElementById('recipe-count-indicator');
    this.recipesCardsGrid = document.getElementById('recipes-cards-grid');

    // Shopping View
    this.shoppingCategoriesColumn = document.getElementById('shopping-categories-column');
    this.shoppingMealsMiniList = document.getElementById('shopping-meals-mini-list');
    this.shoppingStatsText = document.getElementById('shopping-stats-text');
    this.btnCopyShopping = document.getElementById('btn-copy-shopping');
    this.btnPrintShopping = document.getElementById('btn-print-shopping');
    this.btnClearCheckedShopping = document.getElementById('btn-clear-checked-shopping');
    this.formAddCustomItem = document.getElementById('form-add-custom-item');
    this.customItemInput = document.getElementById('custom-item-input');
    this.customItemCategory = document.getElementById('custom-item-category');

    // Modals
    this.modalRecipeDetails = document.getElementById('modal-recipe-details');
    this.recipeModalTitle = document.getElementById('recipe-modal-title');
    this.recipeModalBody = document.getElementById('recipe-modal-body');
    this.btnCloseDetails = document.getElementById('btn-close-details');
    this.btnCloseDetailsFooter = document.getElementById('btn-close-details-footer');
    this.btnPlanFromDetails = document.getElementById('btn-plan-from-details');

    this.modalRecipePicker = document.getElementById('modal-recipe-picker');
    this.pickerModalTitle = document.getElementById('picker-modal-title');
    this.pickerModalSubtitle = document.getElementById('picker-modal-subtitle');
    this.pickerSearchInput = document.getElementById('picker-search-input');
    this.recipePickerList = document.getElementById('recipe-picker-list');
    this.btnClosePicker = document.getElementById('btn-close-picker');
    this.btnCancelPicker = document.getElementById('btn-cancel-picker');

    this.modalSurprise = document.getElementById('modal-surprise');
    this.surpriseRecipeCard = document.getElementById('surprise-recipe-card');
    this.surpriseTargetDay = document.getElementById('surprise-target-day');
    this.surpriseTargetSlot = document.getElementById('surprise-target-slot');
    this.btnSpinAgain = document.getElementById('btn-spin-again');
    this.btnAddSurpriseToPlan = document.getElementById('btn-add-surprise-to-plan');
    this.btnCloseSurprise = document.getElementById('btn-close-surprise');

    this.modalSettings = document.getElementById('modal-settings');
    this.settingsStatusBox = document.getElementById('settings-status-box');
    this.settingsStatusText = document.getElementById('settings-status-text');
    this.settingsSheetId = document.getElementById('settings-sheet-id');
    this.settingsSheetGid = document.getElementById('settings-sheet-gid');
    this.btnSaveSheetSettings = document.getElementById('btn-save-sheet-settings');
    this.btnResetSheetDefault = document.getElementById('btn-reset-sheet-default');
    this.btnCloseSettings = document.getElementById('btn-close-settings');

    this.toastContainer = document.getElementById('toast-container');
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Tab switching
    this.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Week navigation
    this.btnPrevWeek.addEventListener('click', () => {
      this.currentWeekKey = this.storageService.offsetWeek(this.currentWeekKey, -1);
      this.onWeekChanged();
    });

    this.btnNextWeek.addEventListener('click', () => {
      this.currentWeekKey = this.storageService.offsetWeek(this.currentWeekKey, 1);
      this.onWeekChanged();
    });

    this.btnTodayWeek.addEventListener('click', () => {
      this.currentWeekKey = this.storageService.getWeekKey(new Date());
      this.onWeekChanged();
    });

    this.btnClearWeek.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all planned meals for this week?')) {
        this.storageService.clearWeek(this.currentWeekKey);
        this.storageService.clearCheckedShopping(this.currentWeekKey);
        this.onWeekChanged();
        this.showToast('Week meal plan cleared.', 'info');
      }
    });

    // Recipe Refresh
    this.btnRefreshSheets.addEventListener('click', async () => {
      this.btnRefreshSheets.classList.add('spinning');
      this.syncBtnLabel.textContent = 'Syncing...';
      try {
        await this.sheetsService.fetchRecipes(true);
        this.showToast('Recipes updated from Google Sheets!', 'success');
      } catch (err) {
        this.showToast('Could not refresh from Google Sheets. Using cached data.', 'error');
      } finally {
        this.btnRefreshSheets.classList.remove('spinning');
        this.syncBtnLabel.textContent = 'Refresh Recipes';
      }
    });

    // Recipe search & filtering
    this.recipeSearchInput.addEventListener('input', (e) => {
      this.recipeSearchQuery = e.target.value.toLowerCase().trim();
      this.btnClearSearch.classList.toggle('show', this.recipeSearchQuery.length > 0);
      this.renderRecipesGrid();
    });

    this.btnClearSearch.addEventListener('click', () => {
      this.recipeSearchInput.value = '';
      this.recipeSearchQuery = '';
      this.btnClearSearch.classList.remove('show');
      this.renderRecipesGrid();
      this.recipeSearchInput.focus();
    });

    this.recipeFilterPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;

      this.recipeFilterPills.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      this.activeCategoryFilter = btn.dataset.filter;
      this.renderRecipesGrid();
    });

    // Recipe Picker search
    this.pickerSearchInput.addEventListener('input', () => {
      this.renderPickerList();
    });

    // Surprise Me Modal
    this.btnOpenSurprise.addEventListener('click', () => {
      this.openSurpriseModal();
    });

    this.btnSpinAgain.addEventListener('click', () => {
      this.generateSurpriseMeal();
    });

    this.btnAddSurpriseToPlan.addEventListener('click', () => {
      this.addSurpriseToPlan();
    });

    document.querySelectorAll('.surprise-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.surprise-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.surpriseFilterType = btn.dataset.surpriseType;
        this.generateSurpriseMeal();
      });
    });

    // Shopping List Actions
    this.btnCopyShopping.addEventListener('click', () => {
      this.copyShoppingListToClipboard();
    });

    this.btnPrintShopping.addEventListener('click', () => {
      window.print();
    });

    this.btnClearCheckedShopping.addEventListener('click', () => {
      this.storageService.clearCheckedShopping(this.currentWeekKey);
      this.renderShoppingList();
      this.showToast('Checked items reset.', 'info');
    });

    this.formAddCustomItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.customItemInput.value.trim();
      const cat = this.customItemCategory.value;
      if (!name) return;

      this.storageService.addCustomShopping(this.currentWeekKey, name, cat);
      this.customItemInput.value = '';
      this.renderShoppingList();
      this.updateDashboard();
      this.showToast(`Added "${name}" to shopping list.`, 'success');
    });

    // Modals close buttons
    this.btnCloseDetails.addEventListener('click', () => this.closeModal(this.modalRecipeDetails));
    this.btnCloseDetailsFooter.addEventListener('click', () => this.closeModal(this.modalRecipeDetails));
    this.btnPlanFromDetails.addEventListener('click', () => {
      this.closeModal(this.modalRecipeDetails);
      if (this.selectedRecipeForPlan) {
        this.openRecipePickerForSpecificRecipe(this.selectedRecipeForPlan);
      }
    });

    this.btnClosePicker.addEventListener('click', () => this.closeModal(this.modalRecipePicker));
    this.btnCancelPicker.addEventListener('click', () => this.closeModal(this.modalRecipePicker));
    this.btnCloseSurprise.addEventListener('click', () => this.closeModal(this.modalSurprise));

    // Settings Modal
    this.btnOpenSettings.addEventListener('click', () => {
      const cfg = this.sheetsService.getSheetConfig();
      this.settingsSheetId.value = cfg.sheetId;
      this.settingsSheetGid.value = cfg.gid;
      this.openModal(this.modalSettings);
    });

    this.btnCloseSettings.addEventListener('click', () => this.closeModal(this.modalSettings));

    this.btnSaveSheetSettings.addEventListener('click', async () => {
      const newId = this.settingsSheetId.value.trim();
      const newGid = this.settingsSheetGid.value.trim() || '0';
      if (!newId) return;

      this.btnSaveSheetSettings.textContent = 'Saving...';
      try {
        await this.sheetsService.updateSheetConfig(newId, newGid);
        this.closeModal(this.modalSettings);
        this.showToast('Spreadsheet connection updated and synced!', 'success');
      } catch (err) {
        this.showToast('Failed to connect to the provided sheet. Reverting.', 'error');
      } finally {
        this.btnSaveSheetSettings.textContent = 'Save & Re-sync';
      }
    });

    this.btnResetSheetDefault.addEventListener('click', async () => {
      localStorage.removeItem(window.CONFIG.STORAGE_KEYS.SETTINGS);
      this.settingsSheetId.value = window.CONFIG.SHEET_ID;
      this.settingsSheetGid.value = window.CONFIG.SHEET_GID;
      await this.sheetsService.fetchRecipes(true);
      this.closeModal(this.modalSettings);
      this.showToast('Reset to default Google Spreadsheet.', 'success');
    });

    // Close modals on clicking backdrop
    [this.modalRecipeDetails, this.modalRecipePicker, this.modalSurprise, this.modalSettings].forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) this.closeModal(m);
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        [this.modalRecipeDetails, this.modalRecipePicker, this.modalSurprise, this.modalSettings].forEach(m => {
          this.closeModal(m);
        });
      }
    });
  }

  /**
   * Handle Google Sheets service updates
   */
  handleSheetsStateChange(state) {
    this.recipes = state.recipes || [];

    // Update navigation badge
    this.navRecipesCount.textContent = this.recipes.length;

    // Update sync indicator UI
    this.syncDot.className = 'status-dot';
    if (state.status === 'loading') {
      this.syncDot.classList.add('loading');
      this.syncStatusText.textContent = 'Syncing Google Sheets...';
    } else if (state.status === 'success') {
      const timeStr = state.lastSyncTime ? state.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now';
      this.syncStatusText.textContent = `Live Sheets Connected (${this.recipes.length} recipes • Synced ${timeStr})`;
    } else if (state.status === 'warning') {
      this.syncDot.classList.add('warning');
      this.syncStatusText.textContent = `Using cached recipes (${this.recipes.length} recipes)`;
    } else if (state.status === 'error') {
      this.syncDot.classList.add('error');
      this.syncStatusText.textContent = 'Connection error (Click to configure)';
    }

    // Refresh UI components
    this.renderRecipesGrid();
    this.renderWeeklyPlanner();
    this.renderShoppingList();
    this.updateDashboard();
  }

  /**
   * Switch active navigation tab
   */
  switchTab(tabId) {
    this.activeTab = tabId;

    this.navTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });

    Object.keys(this.viewSections).forEach(k => {
      this.viewSections[k].classList.toggle('active', k === tabId);
    });

    if (tabId === 'shopping') {
      this.renderShoppingList();
    } else if (tabId === 'planner') {
      this.renderWeeklyPlanner();
    } else if (tabId === 'recipes') {
      this.renderRecipesGrid();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * When week navigates
   */
  onWeekChanged() {
    this.renderWeekNavigation();
    this.renderWeeklyPlanner();
    this.renderShoppingList();
    this.updateDashboard();
  }

  /**
   * Render week header text and dates
   */
  renderWeekNavigation() {
    const currentActualWeek = this.storageService.getWeekKey(new Date());
    const isThisWeek = this.currentWeekKey === currentActualWeek;

    const parts = this.currentWeekKey.split('-W');
    const weekNum = parts[1];

    this.weekDisplayTitle.textContent = isThisWeek ? `This Week (Week ${weekNum})` : `Week ${weekNum}, ${parts[0]}`;
    this.weekDisplayDates.textContent = this.storageService.formatWeekRange(this.currentWeekKey);
    this.btnTodayWeek.style.display = isThisWeek ? 'none' : 'inline-flex';
  }

  /**
   * Render 7-day Weekly Calendar (Monday to Sunday)
   */
  renderWeeklyPlanner() {
    const weekPlan = this.storageService.getWeekPlan(this.currentWeekKey);
    const daysDates = this.storageService.getDaysOfWeek(this.currentWeekKey);
    const todayStr = new Date().toDateString();

    this.weeklyCalendarGrid.innerHTML = '';

    window.CONFIG.DAYS.forEach((dayKey, idx) => {
      const dateObj = daysDates[idx];
      const isToday = dateObj.toDateString() === todayStr;

      const col = document.createElement('div');
      col.className = 'day-column' + (isToday ? ' is-today' : '');

      const dayHeader = document.createElement('div');
      dayHeader.className = 'day-column-header';
      dayHeader.innerHTML = `
        <span class="day-name">${window.CONFIG.DAY_LABELS[dayKey]}</span>
        <span class="day-date">${dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      `;
      col.appendChild(dayHeader);

      const mealsContainer = document.createElement('div');
      mealsContainer.className = 'day-meals-container';

      // 3 meal slots: Breakfast, Lunch, Dinner
      window.CONFIG.MEAL_TYPES.forEach(mealType => {
        const mealSlot = document.createElement('div');
        const plannedMeal = weekPlan[dayKey] && weekPlan[dayKey][mealType];

        mealSlot.className = 'meal-slot' + (plannedMeal ? ' has-meal' : '');

        // Slot header tag
        const slotLabel = document.createElement('div');
        slotLabel.className = 'meal-slot-label';
        slotLabel.innerHTML = `
          <span class="meal-type-tag ${mealType}">
            ${window.CONFIG.MEAL_TYPE_LABELS[mealType]}
          </span>
        `;
        mealSlot.appendChild(slotLabel);

        if (plannedMeal) {
          // Meal content
          const content = document.createElement('div');
          content.className = 'filled-meal-content';

          const titleEl = document.createElement('h4');
          titleEl.className = 'meal-recipe-title';
          titleEl.textContent = plannedMeal.name;
          titleEl.title = 'Click to view recipe details';
          titleEl.addEventListener('click', () => {
            this.openRecipeDetails(plannedMeal);
          });
          content.appendChild(titleEl);

          // Ingredients preview
          if (plannedMeal.ingredients && plannedMeal.ingredients.length > 0) {
            const ingPreview = document.createElement('div');
            ingPreview.className = 'meal-ingredients-preview';
            ingPreview.textContent = plannedMeal.ingredients.join(', ');
            content.appendChild(ingPreview);
          }

          mealSlot.appendChild(content);

          // Slot Action buttons: View, Change, Remove
          const actions = document.createElement('div');
          actions.className = 'meal-slot-actions';
          actions.innerHTML = `
            <button class="slot-action-btn" title="View full recipe details" data-action="view">
              <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View</span>
            </button>
            <button class="slot-action-btn" title="Change to another recipe" data-action="change">
              <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              <span>Change</span>
            </button>
            <button class="slot-action-btn delete" title="Remove meal from calendar" data-action="delete">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>Remove</span>
            </button>
          `;

          actions.querySelector('[data-action="view"]').addEventListener('click', () => {
            this.openRecipeDetails(plannedMeal);
          });

          actions.querySelector('[data-action="change"]').addEventListener('click', () => {
            this.openRecipePicker(dayKey, mealType);
          });

          actions.querySelector('[data-action="delete"]').addEventListener('click', () => {
            this.storageService.removeMeal(this.currentWeekKey, dayKey, mealType);
            this.renderWeeklyPlanner();
            this.renderShoppingList();
            this.updateDashboard();
            this.showToast(`Removed meal from ${window.CONFIG.DAY_LABELS[dayKey]} ${window.CONFIG.MEAL_TYPE_LABELS[mealType]}.`, 'info');
          });

          mealSlot.appendChild(actions);
        } else {
          // Empty state: + Add Meal button
          const addBtn = document.createElement('button');
          addBtn.className = 'empty-slot-btn';
          addBtn.innerHTML = `
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>+ Add ${window.CONFIG.MEAL_TYPE_LABELS[mealType]}</span>
          `;
          addBtn.addEventListener('click', () => {
            this.openRecipePicker(dayKey, mealType);
          });
          mealSlot.appendChild(addBtn);
        }

        mealsContainer.appendChild(mealSlot);
      });

      col.appendChild(mealsContainer);
      this.weeklyCalendarGrid.appendChild(col);
    });
  }

  /**
   * Render Recipe Collection ("My Recipes")
   */
  renderRecipesGrid() {
    this.recipesCardsGrid.innerHTML = '';

    // Filter recipes by category and search query
    let filtered = this.recipes.filter(recipe => {
      // Category filter
      if (this.activeCategoryFilter !== 'all') {
        if (recipe.categoryNormalized !== this.activeCategoryFilter) {
          // Check if custom category matches
          if (recipe.category.toLowerCase() !== this.activeCategoryFilter) {
            return false;
          }
        }
      }

      // Search query filter
      if (this.recipeSearchQuery) {
        const text = `${recipe.name} ${recipe.category} ${recipe.ingredientsRaw} ${recipe.notes}`.toLowerCase();
        if (!text.includes(this.recipeSearchQuery)) {
          return false;
        }
      }
      return true;
    });

    this.recipeCountIndicator.textContent = `Showing ${filtered.length} of ${this.recipes.length} recipes`;

    if (filtered.length === 0) {
      this.recipesCardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px dashed var(--border-medium);">
          <h3 style="font-family: var(--font-serif); font-size: 1.3rem; margin-bottom: 0.5rem; color: var(--text-main);">No recipes found</h3>
          <p style="font-size: 0.88rem;">Try clearing your search query or choosing another filter category.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(recipe => {
      const card = document.createElement('div');
      card.className = 'recipe-card';

      const catBadgeClass = recipe.categoryNormalized === 'breakfast' ? 'breakfast' : 'lunch-dinner';

      card.innerHTML = `
        <div>
          <div class="recipe-card-header">
            <h3 class="recipe-card-title">${recipe.name}</h3>
            <span class="recipe-category-tag ${catBadgeClass}">${recipe.category}</span>
          </div>

          <div class="recipe-card-body">
            <div class="recipe-ingredients-list">
              ${recipe.ingredients.map(ing => `<span class="ingredient-pill">${ing}</span>`).join('')}
            </div>
            ${recipe.notes ? `<div class="recipe-notes-snippet">“${recipe.notes}”</div>` : ''}
          </div>
        </div>

        <div class="recipe-card-footer">
          <button class="btn-card-action ghost btn-view-recipe">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>View Details</span>
          </button>
          <button class="btn-card-action primary btn-plan-recipe">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Plan This Meal</span>
          </button>
        </div>
      `;

      card.querySelector('.btn-view-recipe').addEventListener('click', () => {
        this.openRecipeDetails(recipe);
      });

      card.querySelector('.btn-plan-recipe').addEventListener('click', () => {
        this.openRecipePickerForSpecificRecipe(recipe);
      });

      this.recipesCardsGrid.appendChild(card);
    });
  }

  /**
   * Render Shopping List View (Requirement 5)
   */
  renderShoppingList() {
    const scheduledMeals = this.storageService.getScheduledMeals(this.currentWeekKey);
    const checkedItems = this.storageService.getCheckedShopping(this.currentWeekKey);
    const customItems = this.storageService.getCustomShopping(this.currentWeekKey);

    const shoppingData = this.ingredientService.generateShoppingList(scheduledMeals, checkedItems, customItems);

    // Update stats pill
    this.shoppingStatsText.innerHTML = `<strong>${shoppingData.totalItems}</strong> items needed (${shoppingData.checkedCount} checked)`;
    this.navShoppingCount.textContent = shoppingData.totalItems;

    // Render categorized groups
    this.shoppingCategoriesColumn.innerHTML = '';

    if (shoppingData.allEmpty) {
      this.shoppingCategoriesColumn.innerHTML = `
        <div class="empty-shopping-state">
          <div class="empty-shopping-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </div>
          <h3 style="font-family: var(--font-serif); font-size: 1.35rem; color: var(--text-main);">Your Shopping List is Empty</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); max-width: 360px;">
            Add meals to your weekly calendar or use "Add Extra Item" on the right to build your grocery list.
          </p>
          <button class="btn-card-action primary" id="btn-jump-to-planner">
            Go to Weekly Planner
          </button>
        </div>
      `;
      const jumpBtn = this.shoppingCategoriesColumn.querySelector('#btn-jump-to-planner');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => this.switchTab('planner'));
      }
    } else {
      shoppingData.categoryGroups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'shopping-category-card';

        const header = document.createElement('div');
        header.className = 'category-card-header';
        header.innerHTML = `
          <div class="category-title-wrap">
            <span class="category-icon">${group.icon}</span>
            <h4 class="category-title">${group.name}</h4>
          </div>
          <span class="category-count">${group.items.length} items</span>
        `;
        card.appendChild(header);

        const list = document.createElement('div');
        list.className = 'shopping-items-list';

        group.items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'shopping-item-row' + (item.isChecked ? ' checked' : '');

          const label = document.createElement('label');
          label.className = 'item-checkbox-label';

          const checkbox = document.createElement('div');
          checkbox.className = 'custom-checkbox';
          checkbox.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;

          const info = document.createElement('div');
          info.className = 'item-info';

          const nameEl = document.createElement('span');
          nameEl.className = 'item-name';
          nameEl.textContent = item.displayName;

          const sourcesEl = document.createElement('span');
          sourcesEl.className = 'item-sources';
          if (item.isCustom) {
            sourcesEl.textContent = 'Custom item';
          } else {
            const countStr = item.count > 1 ? ` (${item.count} meals)` : '';
            sourcesEl.innerHTML = `for: <span>${item.sources.join(', ')}</span>${countStr}`;
          }

          info.appendChild(nameEl);
          info.appendChild(sourcesEl);

          label.appendChild(checkbox);
          label.appendChild(info);
          row.appendChild(label);

          // Click handler to toggle checked
          label.addEventListener('click', (e) => {
            e.preventDefault();
            const newChecked = !item.isChecked;
            if (item.isCustom) {
              this.storageService.toggleCustomShopping(this.currentWeekKey, item.id, newChecked);
            } else {
              this.storageService.toggleCheckedShopping(this.currentWeekKey, item.key, newChecked);
            }
            this.renderShoppingList();
            this.updateDashboard();
          });

          // Delete button for custom items
          if (item.isCustom) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'remove-custom-btn';
            deleteBtn.title = 'Remove item';
            deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.storageService.removeCustomShopping(this.currentWeekKey, item.id);
              this.renderShoppingList();
              this.updateDashboard();
            });
            row.appendChild(deleteBtn);
          }

          list.appendChild(row);
        });

        card.appendChild(list);
        this.shoppingCategoriesColumn.appendChild(card);
      });
    }

    // Render Sourced Meals Mini List
    this.shoppingMealsMiniList.innerHTML = '';
    if (scheduledMeals.length === 0) {
      this.shoppingMealsMiniList.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">No meals scheduled this week yet.</span>`;
    } else {
      scheduledMeals.forEach(({ dayLabel, mealTypeLabel, recipe }) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'planned-meal-mini-row';
        itemRow.innerHTML = `
          <span><strong>${recipe.name}</strong></span>
          <span class="day-badge">${dayLabel.slice(0, 3)} ${mealTypeLabel}</span>
        `;
        this.shoppingMealsMiniList.appendChild(itemRow);
      });
    }
  }

  /**
   * Update top dashboard stats (Requirement 7)
   */
  updateDashboard() {
    const scheduled = this.storageService.getScheduledMeals(this.currentWeekKey);
    const plannedCount = scheduled.length;
    this.dashPlannedMeals.textContent = `${plannedCount} / 21`;

    // Unique recipe names
    const uniqueRecipes = new Set(scheduled.map(s => s.recipe.name));
    this.dashUniqueRecipes.textContent = uniqueRecipes.size;

    // Shopping items
    const checked = this.storageService.getCheckedShopping(this.currentWeekKey);
    const custom = this.storageService.getCustomShopping(this.currentWeekKey);
    const shopData = this.ingredientService.generateShoppingList(scheduled, checked, custom);

    this.dashShoppingItems.textContent = `${shopData.totalItems} items (${shopData.checkedCount} checked)`;
  }

  /**
   * Copy plain-text shopping list to clipboard
   */
  copyShoppingListToClipboard() {
    const scheduledMeals = this.storageService.getScheduledMeals(this.currentWeekKey);
    const checkedItems = this.storageService.getCheckedShopping(this.currentWeekKey);
    const customItems = this.storageService.getCustomShopping(this.currentWeekKey);
    const data = this.ingredientService.generateShoppingList(scheduledMeals, checkedItems, customItems);

    if (data.totalItems === 0) {
      this.showToast('Shopping list is currently empty.', 'info');
      return;
    }

    let text = `🛒 Shopping List (${this.storageService.formatWeekRange(this.currentWeekKey)})\n`;
    text += `===============================\n\n`;

    data.categoryGroups.forEach(group => {
      text += `${group.icon} ${group.name.toUpperCase()}\n`;
      group.items.forEach(item => {
        const checkMark = item.isChecked ? '[x]' : '[ ]';
        text += `  ${checkMark} ${item.displayName} (for: ${item.sources.join(', ')})\n`;
      });
      text += `\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Shopping list copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Could not copy to clipboard automatically.', 'error');
    });
  }

  /**
   * Open Recipe Details Modal (Requirement 4)
   */
  openRecipeDetails(recipe) {
    this.selectedRecipeForPlan = recipe;
    this.recipeModalTitle.textContent = recipe.name;

    const catBadgeClass = recipe.categoryNormalized === 'breakfast' ? 'breakfast' : 'lunch-dinner';

    this.recipeModalBody.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
        <span class="recipe-category-tag ${catBadgeClass}">${recipe.category}</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${recipe.ingredients.length} ingredients</span>
      </div>

      <div>
        <h4 style="font-family: var(--font-serif); font-size: 1.1rem; margin-bottom: 0.6rem; color: var(--text-main);">Ingredients:</h4>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          ${recipe.ingredients.map(ing => `
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; padding: 0.35rem 0.5rem; background: var(--bg-surface-warm); border-radius: var(--radius-xs);">
              <span style="color: var(--sage-primary);">•</span>
              <span>${ing}</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${recipe.notes ? `
        <div style="margin-top: 0.5rem;">
          <h4 style="font-family: var(--font-serif); font-size: 1.1rem; margin-bottom: 0.4rem; color: var(--text-main);">Cook's Notes & Tips:</h4>
          <div style="padding: 0.75rem 0.95rem; background-color: var(--sage-subtle); border-left: 3px solid var(--sage-primary); border-radius: 0 var(--radius-xs) var(--radius-xs) 0; font-size: 0.88rem; color: var(--text-main); line-height: 1.45;">
            ${recipe.notes}
          </div>
        </div>
      ` : ''}
    `;

    this.openModal(this.modalRecipeDetails);
  }

  /**
   * Open Recipe Picker to assign to a day & slot
   */
  openRecipePicker(day, mealType) {
    this.pickerTarget = { day, mealType };
    this.pickerModalTitle.textContent = 'Select Recipe';
    this.pickerModalSubtitle.textContent = `For ${window.CONFIG.DAY_LABELS[day]} ${window.CONFIG.MEAL_TYPE_LABELS[mealType]}`;
    this.pickerSearchInput.value = '';
    this.renderPickerList();
    this.openModal(this.modalRecipePicker);
  }

  /**
   * Open Recipe Picker when starting from a specific recipe
   */
  openRecipePickerForSpecificRecipe(recipe) {
    // If meal category is breakfast, suggest breakfast slot
    let defaultSlot = recipe.categoryNormalized === 'breakfast' ? 'breakfast' : 'dinner';

    const dayName = prompt(`Plan "${recipe.name}" on which day?\nEnter: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday`, 'Monday');
    if (!dayName) return;

    const lowerDay = dayName.toLowerCase().trim();
    const matchedDay = window.CONFIG.DAYS.find(d => d.startsWith(lowerDay) || lowerDay.startsWith(d));
    if (!matchedDay) {
      alert('Invalid day name entered. Please choose Monday through Sunday.');
      return;
    }

    const slotPrompt = prompt(`Which meal slot on ${window.CONFIG.DAY_LABELS[matchedDay]}?\nEnter: Breakfast, Lunch, or Dinner`, defaultSlot);
    if (!slotPrompt) return;

    const lowerSlot = slotPrompt.toLowerCase().trim();
    const matchedSlot = window.CONFIG.MEAL_TYPES.find(m => m.startsWith(lowerSlot) || lowerSlot.startsWith(m));
    if (!matchedSlot) {
      alert('Invalid meal slot. Please choose Breakfast, Lunch, or Dinner.');
      return;
    }

    this.storageService.setMeal(this.currentWeekKey, matchedDay, matchedSlot, recipe);
    this.renderWeeklyPlanner();
    this.renderShoppingList();
    this.updateDashboard();
    this.showToast(`Planned "${recipe.name}" for ${window.CONFIG.DAY_LABELS[matchedDay]} ${window.CONFIG.MEAL_TYPE_LABELS[matchedSlot]}!`, 'success');
  }

  /**
   * Render list inside Recipe Picker Modal
   */
  renderPickerList() {
    const q = this.pickerSearchInput.value.toLowerCase().trim();
    let recipesToDisplay = this.recipes;

    // Filter by search query if any
    if (q) {
      recipesToDisplay = recipesToDisplay.filter(r =>
        `${r.name} ${r.category} ${r.ingredientsRaw} ${r.notes}`.toLowerCase().includes(q)
      );
    }

    this.recipePickerList.innerHTML = '';

    if (recipesToDisplay.length === 0) {
      this.recipePickerList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No recipes found matching "${q}"
        </div>
      `;
      return;
    }

    recipesToDisplay.forEach(recipe => {
      const item = document.createElement('div');
      item.className = 'recipe-picker-item';
      item.innerHTML = `
        <div>
          <div class="picker-item-name">${recipe.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${recipe.ingredients.slice(0, 4).join(', ')}${recipe.ingredients.length > 4 ? '...' : ''}</div>
        </div>
        <span class="picker-item-cat">${recipe.category}</span>
      `;

      item.addEventListener('click', () => {
        if (this.pickerTarget.day && this.pickerTarget.mealType) {
          this.storageService.setMeal(this.currentWeekKey, this.pickerTarget.day, this.pickerTarget.mealType, recipe);
          this.closeModal(this.modalRecipePicker);
          this.renderWeeklyPlanner();
          this.renderShoppingList();
          this.updateDashboard();
          this.showToast(`Added "${recipe.name}" to ${window.CONFIG.DAY_LABELS[this.pickerTarget.day]} ${window.CONFIG.MEAL_TYPE_LABELS[this.pickerTarget.mealType]}!`, 'success');
        }
      });

      this.recipePickerList.appendChild(item);
    });
  }

  /**
   * Surprise Me Modal (Requirement 6)
   */
  openSurpriseModal() {
    if (this.recipes.length === 0) {
      this.showToast('No recipes loaded yet.', 'error');
      return;
    }
    this.generateSurpriseMeal();
    this.openModal(this.modalSurprise);
  }

  generateSurpriseMeal() {
    let pool = this.recipes;

    if (this.surpriseFilterType === 'breakfast') {
      pool = pool.filter(r => r.categoryNormalized === 'breakfast');
    } else if (this.surpriseFilterType === 'lunch/dinner') {
      pool = pool.filter(r => r.categoryNormalized === 'lunch/dinner');
    }

    if (pool.length === 0) {
      pool = this.recipes;
    }

    // Pick random
    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosen = pool[randomIndex];
    this.currentSurpriseRecipe = chosen;

    // Adapt target slot based on category
    if (chosen.categoryNormalized === 'breakfast') {
      this.surpriseTargetSlot.value = 'breakfast';
    } else {
      this.surpriseTargetSlot.value = 'dinner';
    }

    this.surpriseRecipeCard.innerHTML = `
      <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--sage-primary); letter-spacing: 0.05em;">
        ${chosen.category}
      </div>
      <h3 class="surprise-recipe-name">${chosen.name}</h3>
      <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; max-width: 400px;">
        ${chosen.ingredients.join(' • ')}
      </div>
      ${chosen.notes ? `
        <div style="font-size: 0.8rem; font-style: italic; color: var(--text-muted); background: rgba(255,255,255,0.7); padding: 0.45rem 0.75rem; border-radius: var(--radius-xs); border-left: 2px solid var(--sage-primary);">
          “${chosen.notes}”
        </div>
      ` : ''}
    `;
  }

  addSurpriseToPlan() {
    if (!this.currentSurpriseRecipe) return;

    const day = this.surpriseTargetDay.value;
    const slot = this.surpriseTargetSlot.value;

    this.storageService.setMeal(this.currentWeekKey, day, slot, this.currentSurpriseRecipe);
    this.closeModal(this.modalSurprise);
    this.renderWeeklyPlanner();
    this.renderShoppingList();
    this.updateDashboard();
    this.showToast(`✨ Surprise! Added "${this.currentSurpriseRecipe.name}" to ${window.CONFIG.DAY_LABELS[day]} ${window.CONFIG.MEAL_TYPE_LABELS[slot]}!`, 'success');
  }

  /**
   * Modal management
   */
  openModal(modalEl) {
    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closeModal(modalEl) {
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
  }

  /**
   * Toast notifications
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
}

// Instantiate application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MealPlannerApp();
});
