// Menu Catalog builder controller for menu-builder.html protected panel
import { initAuthGuard } from './auth.js';
import { addMenuCategory, deleteMenuCategory, saveMenuItem, toggleItemAvailability } from './db.js';
import { subscribeCategories, subscribeItems } from './realtime.js';
import { toggleModal, showAlert } from './utils.js';

let activeUser = null;
let activeRestaurant = null;

let categoriesCache = [];
let menuItemsList = [];
let editingItemId = null;

// DOM references
const categoryListBody = document.getElementById('category-list-body');
const addCategoryBtn = document.getElementById('add-category-btn');
const categoryModal = document.getElementById('category-modal');
const closeCategoryModal = document.getElementById('close-category-modal');
const categoryForm = document.getElementById('category-form');

const itemsGrid = document.getElementById('items-grid');
const addItemBtn = document.getElementById('add-item-btn');
const itemModal = document.getElementById('item-modal');
const closeItemModal = document.getElementById('close-item-modal');
const itemForm = document.getElementById('item-form');
const itemCatSelect = document.getElementById('item-category-id');

// Tabs inside Menu configuration
const itemsSubtab = document.getElementById('menu-items-subtab');
const catsSubtab = document.getElementById('menu-cats-subtab');
const itemsWrapper = document.getElementById('items-grid-wrapper');
const catsWrapper = document.getElementById('cats-table-wrapper');

const initMenuBuilder = () => {
  // Subtab routing toggles
  if (itemsSubtab && catsSubtab) {
    itemsSubtab.addEventListener('click', () => {
      itemsSubtab.classList.add('active');
      catsSubtab.classList.remove('active');
      if (itemsWrapper) itemsWrapper.classList.remove('hidden');
      if (catsWrapper) catsWrapper.classList.add('hidden');
      if (addItemBtn) addItemBtn.classList.remove('hidden');
      if (addCategoryBtn) addCategoryBtn.classList.add('hidden');
    });

    catsSubtab.addEventListener('click', () => {
      catsSubtab.classList.add('active');
      itemsSubtab.classList.remove('active');
      if (catsWrapper) catsWrapper.classList.remove('hidden');
      if (itemsWrapper) itemsWrapper.classList.add('hidden');
      if (addCategoryBtn) addCategoryBtn.classList.remove('hidden');
      if (addItemBtn) addItemBtn.classList.add('hidden');
    });
  }

  // Modals actions binding
  if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => {
    categoryForm.reset();
    toggleModal(categoryModal, true);
  });
  if (closeCategoryModal) closeCategoryModal.addEventListener('click', () => toggleModal(categoryModal, false));
  if (categoryForm) categoryForm.addEventListener('submit', handleAddCategorySubmit);

  if (addItemBtn) addItemBtn.addEventListener('click', () => {
    editingItemId = null;
    document.getElementById('item-modal-title').innerText = 'Create New Dish';
    itemForm.reset();
    populateCategoryDropdown();
    toggleModal(itemModal, true);
  });
  if (closeItemModal) closeItemModal.addEventListener('click', () => toggleModal(itemModal, false));
  if (itemForm) itemForm.addEventListener('submit', handleSaveItemSubmit);

  // Subscriptions
  subscribeCategories((categories) => {
    categoriesCache = categories.sort((a, b) => a.display_order - b.display_order);
    renderCategoriesTable();
    populateCategoryDropdown();
  });

  subscribeItems((items) => {
    menuItemsList = items.sort((a, b) => a.name.localeCompare(b.name));
    renderMenuItemsGrid();
  });
};

const renderCategoriesTable = () => {
  if (!categoryListBody) return;
  categoryListBody.innerHTML = '';

  if (categoriesCache.length === 0) {
    categoryListBody.innerHTML = '<tr><td colspan="4" class="text-xs text-slate-500 py-6 text-center">No categories created yet. Click Add Category to start.</td></tr>';
    return;
  }

  categoriesCache.forEach(cat => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid hsla(217, 30%, 18%, 0.4)';
    tr.innerHTML = `
      <td style="padding: 12px; font-weight: 600; color: #fff;">${cat.name}</td>
      <td style="padding: 12px; color: var(--text-muted);">${cat.display_order}</td>
      <td style="padding: 12px; text-transform: uppercase; font-size: 11px; color: var(--primary-hover); font-weight: 700;">${cat.routing}</td>
      <td style="padding: 12px; text-align: right;">
        <button class="btn btn-danger btn-delete-cat" style="padding: 6px 10px;" data-id="${cat.id}">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </td>
    `;
    categoryListBody.appendChild(tr);
  });

  categoryListBody.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm('Deleting this category will hide all its menu items. Continue?')) {
        try {
          await deleteMenuCategory(id);
        } catch (err) {
          alert('Error deleting category.');
        }
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
};

const populateCategoryDropdown = () => {
  if (!itemCatSelect) return;
  itemCatSelect.innerHTML = '';
  categoriesCache.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.innerText = c.name;
    itemCatSelect.appendChild(opt);
  });
};

const renderMenuItemsGrid = () => {
  if (!itemsGrid) return;
  itemsGrid.innerHTML = '';

  const curSymbol = activeRestaurant?.currency || '₹';

  if (menuItemsList.length === 0) {
    itemsGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No dishes added to menu catalog yet. Click Create Dish above.</p>';
    return;
  }

  menuItemsList.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass-panel menu-item-card animate-slide-up';
    card.style.display = 'flex';
    card.style.justifyContent = 'space-between';
    card.innerHTML = `
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${item.tags?.includes('Veg') ? 'var(--success)' : 'var(--danger)'}"></span>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">${item.category_name}</span>
          ${!item.is_available ? '<span class="badge" style="background: hsla(38, 92%, 50%, 0.15); color: hsl(38, 92%, 50%); border-color: hsla(38, 92%, 50%, 0.2)">Sold Out</span>' : ''}
        </div>
        <h4 style="color: #fff; font-size: 16px; margin-bottom: 4px;">${item.name}</h4>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; line-clamp: 2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; max-width: 260px;">${item.description || ''}</p>
        <div style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 12px;">
          <span>${curSymbol}${parseFloat(item.price.toString()).toFixed(2)}</span>
          <span style="font-weight: 400; color: var(--text-muted); font-size: 11px;">• &nbsp;${item.prep_time} mins prep</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; shrink-0;">
        <button class="btn btn-secondary btn-edit-item" style="padding: 6px 10px;" data-id="${item.id}">
          <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
        </button>
        
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 16px;">
          <span style="font-size: 11px; color: var(--text-muted);">Available:</span>
          <button class="toggle-availability-btn" data-id="${item.id}" data-status="${item.is_available}" style="width: 38px; height: 22px; border-radius: 999px; border: none; padding: 2px; cursor: pointer; transition: all 0.2s; background: ${item.is_available ? 'var(--primary)' : 'var(--text-dark)'}; display: flex; align-items: center; justify-content: ${item.is_available ? 'flex-end' : 'flex-start'};">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #fff; display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></span>
          </button>
        </div>
      </div>
    `;
    itemsGrid.appendChild(card);
  });

  // Action triggers
  itemsGrid.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = menuItemsList.find(i => i.id === btn.dataset.id);
      if (item) {
        editingItemId = item.id;
        document.getElementById('item-modal-title').innerText = 'Edit Dish';
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-price').value = item.price;
        document.getElementById('item-desc').value = item.description || '';
        document.getElementById('item-prep').value = item.prep_time;
        document.getElementById('item-tags').value = item.tags?.join(', ') || '';
        document.getElementById('item-allergens').value = item.allergens?.join(', ') || '';
        
        populateCategoryDropdown();
        itemCatSelect.value = item.category_id;
        toggleModal(itemModal, true);
      }
    });
  });

  itemsGrid.querySelectorAll('.toggle-availability-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.status === 'true';
      try {
        await toggleItemAvailability(id, status);
      } catch (err) {
        alert("Failed to toggle item state.");
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
};

const handleAddCategorySubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const order = parseInt(document.getElementById('cat-order').value) || 1;
  const routing = document.getElementById('cat-routing').value;

  try {
    toggleModal(categoryModal, false);
    await addMenuCategory(name, order, routing);
  } catch (err) {
    alert("Error creating category.");
  }
};

const handleSaveItemSubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value) || 0;
  const description = document.getElementById('item-desc').value.trim();
  const categoryId = itemCatSelect.value;
  const prepTime = parseInt(document.getElementById('item-prep').value) || 15;
  const tagsStr = document.getElementById('item-tags').value;
  const allergensStr = document.getElementById('item-allergens').value;

  const categoryName = categoriesCache.find(c => c.id === categoryId)?.name || 'General';
  const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const allergens = allergensStr.split(',').map(a => a.trim()).filter(a => a.length > 0);

  const payload = {
    category_id: categoryId,
    category_name: categoryName,
    name,
    description,
    price,
    prep_time: prepTime,
    tags,
    allergens
  };

  try {
    toggleModal(itemModal, false);
    await saveMenuItem(editingItemId, payload);
  } catch (err) {
    alert("Error saving menu item: " + err.message);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('menu-builder', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initMenuBuilder();
  });
});
