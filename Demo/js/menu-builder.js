// Menu Catalog builder controller for menu-builder.html protected panel
import { initAuthGuard } from './auth.js';
import { addMenuCategory, deleteMenuCategory, saveMenuItem, toggleItemAvailability, saveBulkCatalog } from './db.js';
import { subscribeCategories, subscribeItems } from './realtime.js';
import { toggleModal, showAlert } from './utils.js';

let activeUser = null;
let activeRestaurant = null;

let categoriesCache = [];
let menuItemsList = [];
let editingItemId = null;
let currentBase64Image = "";
let modifierEditingItemId = null;
let editingModifierGroups = [];

// DOM references
const itemImageFile = document.getElementById('item-image-file');
const itemImageFilename = document.getElementById('item-image-filename');
const itemImagePreviewContainer = document.getElementById('item-image-preview-container');
const itemImagePreview = document.getElementById('item-image-preview');
const removeItemImageBtn = document.getElementById('remove-item-image-btn');
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

// CSV Actions DOM references
const exportMenuBtn = document.getElementById('export-menu-btn');
const importMenuBtn = document.getElementById('import-menu-btn');
const importMenuCsv = document.getElementById('import-menu-csv');

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
    delete itemForm.dataset.imageExtension;
    currentBase64Image = "";
    if (itemImageFile) itemImageFile.value = '';
    if (itemImageFilename) itemImageFilename.innerText = 'No file selected';
    if (itemImagePreviewContainer) itemImagePreviewContainer.style.display = 'none';
    populateCategoryDropdown();
    toggleModal(itemModal, true);
  });
  if (closeItemModal) closeItemModal.addEventListener('click', () => toggleModal(itemModal, false));
  if (itemForm) itemForm.addEventListener('submit', handleSaveItemSubmit);

  // File upload change listener
  if (itemImageFile) {
    itemImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 256000) { // Limit to 250KB
        alert("Image is too large! Please choose an image smaller than 250KB to ensure fast loading times.");
        itemImageFile.value = '';
        return;
      }

      if (itemImageFilename) itemImageFilename.innerText = file.name;

      // Track image extension on itemForm dataset
      const fileNameParts = file.name.split('.');
      itemForm.dataset.imageExtension = fileNameParts.length > 1 ? fileNameParts[fileNameParts.length - 1] : 'jpg';

      const reader = new FileReader();
      reader.onload = (event) => {
        currentBase64Image = event.target.result;
        if (itemImagePreview) itemImagePreview.src = currentBase64Image;
        if (itemImagePreviewContainer) itemImagePreviewContainer.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  // Remove image click listener
  if (removeItemImageBtn) {
    removeItemImageBtn.addEventListener('click', () => {
      currentBase64Image = "";
      delete itemForm.dataset.imageExtension;
      if (itemImageFile) itemImageFile.value = '';
      if (itemImageFilename) itemImageFilename.innerText = 'No file selected';
      if (itemImagePreviewContainer) itemImagePreviewContainer.style.display = 'none';
    });
  }

  // CSV Export/Import listeners
  if (exportMenuBtn) {
    exportMenuBtn.addEventListener('click', handleExportMenuCSV);
  }
  if (importMenuBtn && importMenuCsv) {
    importMenuBtn.addEventListener('click', () => importMenuCsv.click());
    importMenuCsv.addEventListener('change', handleImportMenuCSV);
  }

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

  // Modifiers Modal Event Listeners
  const closeModifiersModal = document.getElementById('close-modifiers-modal');
  const cancelModifiersBtn = document.getElementById('cancel-modifiers-btn');
  const addModGroupBtn = document.getElementById('add-mod-group-btn');
  const saveModifiersBtn = document.getElementById('save-modifiers-btn');

  if (closeModifiersModal) {
    closeModifiersModal.addEventListener('click', () => toggleModal(document.getElementById('modifiers-modal'), false));
  }
  if (cancelModifiersBtn) {
    cancelModifiersBtn.addEventListener('click', () => toggleModal(document.getElementById('modifiers-modal'), false));
  }
  if (addModGroupBtn) {
    addModGroupBtn.addEventListener('click', handleAddModifierGroup);
  }
  if (saveModifiersBtn) {
    saveModifiersBtn.addEventListener('click', handleSaveModifiersSubmit);
  }
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
    card.style.gap = '16px';
    card.innerHTML = `
      <div style="flex: 1; display: flex; gap: 16px;">
        ${item.image ? `
          <img src="${item.image}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" alt="${item.name}">
        ` : ''}
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
      </div>
      <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; shrink-0; gap: 8px;">
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-edit-modifiers" style="padding: 6px 10px; font-size: 11px; display: flex; align-items: center; gap: 4px;" data-id="${item.id}" title="Manage Modifiers">
            <i data-lucide="sliders" style="width: 13px; height: 13px;"></i>
            <span style="font-size: 10px; font-weight: 700;">Mods</span>
          </button>
          <button class="btn btn-secondary btn-edit-item" style="padding: 6px 10px;" data-id="${item.id}">
            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
        
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 12px;">
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
        
        if (item.image) {
          currentBase64Image = item.image;
          if (itemImagePreview) itemImagePreview.src = currentBase64Image;
          if (itemImagePreviewContainer) itemImagePreviewContainer.style.display = 'block';
          if (itemImageFilename) itemImageFilename.innerText = 'Current image loaded';
        } else {
          currentBase64Image = "";
          if (itemImageFile) itemImageFile.value = '';
          if (itemImageFilename) itemImageFilename.innerText = 'No file selected';
          if (itemImagePreviewContainer) itemImagePreviewContainer.style.display = 'none';
        }

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

  itemsGrid.querySelectorAll('.btn-edit-modifiers').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = menuItemsList.find(i => i.id === btn.dataset.id);
      if (item) {
        openModifiersModal(item);
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

  const existingItem = editingItemId ? menuItemsList.find(i => i.id === editingItemId) : null;

  const payload = {
    category_id: categoryId,
    category_name: categoryName,
    name,
    description,
    price,
    prep_time: prepTime,
    tags,
    allergens,
    image: existingItem ? existingItem.image : '',
    imageExtension: itemForm.dataset.imageExtension || '',
    modifierGroups: existingItem ? (existingItem.modifierGroups || []) : []
  };

  try {
    toggleModal(itemModal, false);
    await saveMenuItem(editingItemId, payload);
  } catch (err) {
    alert("Error saving menu item: " + err.message);
  }
};

const handleExportMenuCSV = () => {
  if (menuItemsList.length === 0) {
    alert("No menu items to export.");
    return;
  }

  const headers = ["Category", "Dish Name", "Description", "Price", "Prep Time (mins)", "Tags", "Allergens", "Image Slug"];
  const csvRows = [headers.join(",")];

  menuItemsList.forEach(item => {
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const clean = val.toString().replace(/"/g, '""');
      return `"${clean}"`;
    };

    const row = [
      escapeCsv(item.category_name),
      escapeCsv(item.name),
      escapeCsv(item.description || ""),
      item.price,
      item.prep_time || 15,
      escapeCsv((item.tags || []).join(", ")),
      escapeCsv((item.allergens || []).join(", ")),
      escapeCsv(item.image || "")
    ];
    csvRows.push(row.join(","));
  });

  const csvString = csvRows.join("\r\n");
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `menu_export_${activeRestaurant?.slug || 'catalog'}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const handleImportMenuCSV = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const csvText = event.target.result;
      const parsedRows = parseCSV(csvText);
      if (parsedRows.length <= 1) {
        alert("The CSV file is empty or only contains headers.");
        return;
      }

      const headers = parsedRows[0].map(h => h.trim().toLowerCase());
      const categoryIdx = headers.indexOf("category");
      const nameIdx = headers.indexOf("dish name");
      const descIdx = headers.indexOf("description");
      const priceIdx = headers.indexOf("price");
      const prepIdx = headers.indexOf("prep time (mins)");
      const tagsIdx = headers.indexOf("tags");
      const allergensIdx = headers.indexOf("allergens");
      const imageIdx = headers.indexOf("image slug");

      if (categoryIdx === -1 || nameIdx === -1 || priceIdx === -1) {
        alert("CSV must contain at least 'Category', 'Dish Name', and 'Price' columns.");
        return;
      }

      const categories = [...categoriesCache];
      const items = [...menuItemsList];

      let importedCount = 0;

      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        if (row.length <= Math.max(categoryIdx, nameIdx, priceIdx)) continue;

        const catName = row[categoryIdx]?.trim();
        const dishName = row[nameIdx]?.trim();
        if (!catName || !dishName) continue;

        const description = descIdx !== -1 ? row[descIdx]?.trim() : "";
        const price = parseFloat(row[priceIdx]) || 0;
        const prepTime = prepIdx !== -1 ? parseInt(row[prepIdx]) || 15 : 15;
        const tags = tagsIdx !== -1 ? row[tagsIdx]?.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];
        const allergens = allergensIdx !== -1 ? row[allergensIdx]?.split(',').map(a => a.trim()).filter(a => a.length > 0) : [];
        const csvImageSlug = imageIdx !== -1 ? row[imageIdx]?.trim() : "";

        // Find or create category
        let category = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        if (!category) {
          const newCatId = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          category = {
            id: newCatId,
            name: catName,
            display_order: categories.length + 1,
            routing: 'kitchen',
            created_at: Date.now()
          };
          categories.push(category);
        }

        // Generate slug
        const slug = dishName
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_]+/g, '-')
          .replace(/^-+|-+$/g, '');

        let imagePath = csvImageSlug;
        if (!imagePath) {
          imagePath = `images/menu/${slug}.jpg`;
        }

        const itemData = {
          category_id: category.id,
          category_name: category.name,
          name: dishName,
          description,
          price,
          prep_time: prepTime,
          tags,
          allergens,
          slug,
          image: imagePath,
          is_available: true
        };

        const existingIdx = items.findIndex(item => item.name.toLowerCase() === dishName.toLowerCase());
        if (existingIdx !== -1) {
          items[existingIdx] = {
            ...items[existingIdx],
            ...itemData,
            updated_at: Date.now()
          };
        } else {
          const newItemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          items.push({
            id: newItemId,
            ...itemData,
            created_at: Date.now()
          });
        }
        importedCount++;
      }

      await saveBulkCatalog(categories, items);
      alert(`Import complete! Loaded ${importedCount} dishes and updated categories.`);
    } catch (err) {
      alert("Failed to parse CSV: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',') {
      if (inQuotes) {
        row[row.length - 1] += c;
      } else {
        row.push("");
      }
    } else if (c === '\r' || c === '\n') {
      if (inQuotes) {
        row[row.length - 1] += c;
      } else {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      }
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

const openModifiersModal = (item) => {
  modifierEditingItemId = item.id;
  document.getElementById('modifiers-dish-name').innerText = item.name;
  
  // Deep clone modifierGroups
  editingModifierGroups = JSON.parse(JSON.stringify(item.modifierGroups || []));
  
  // Render groups
  renderModifierGroupsUI();
  
  toggleModal(document.getElementById('modifiers-modal'), true);
};

const renderModifierGroupsUI = () => {
  const container = document.getElementById('modifier-groups-container');
  if (!container) return;
  container.innerHTML = '';

  if (editingModifierGroups.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px 0;">No modifier groups created. Click Add Modifier Group to begin.</p>';
    return;
  }

  editingModifierGroups.forEach((group, groupIdx) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'modifier-group-box';
    
    groupEl.innerHTML = `
      <div class="modifier-group-header">
        <input type="text" class="group-name-input" placeholder="e.g. Size, Crust, Extras" value="${group.groupName || ''}" data-idx="${groupIdx}" style="flex: 1; max-width: 180px; padding: 8px 12px; font-size: 13px;">
        
        <div class="modifier-group-options">
          <label>
            <input type="checkbox" class="group-required-checkbox" data-idx="${groupIdx}" ${group.required ? 'checked' : ''}>
            <span>Required</span>
          </label>
          <label>
            <input type="checkbox" class="group-multiselect-checkbox" data-idx="${groupIdx}" ${group.multiSelect ? 'checked' : ''}>
            <span>Multi-select</span>
          </label>
        </div>

        <div class="modifier-group-controls">
          <button type="button" class="btn btn-secondary btn-icon move-group-up" data-idx="${groupIdx}" title="Move Up">
            <i data-lucide="arrow-up" style="width: 14px; height: 14px;"></i>
          </button>
          <button type="button" class="btn btn-secondary btn-icon move-group-down" data-idx="${groupIdx}" title="Move Down">
            <i data-lucide="arrow-down" style="width: 14px; height: 14px;"></i>
          </button>
          <button type="button" class="btn btn-danger btn-icon delete-group" data-idx="${groupIdx}" title="Delete Group">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </div>

      <div class="modifiers-list-container" style="display: flex; flex-direction: column; gap: 8px;" data-group-idx="${groupIdx}">
        <!-- List of modifier choices in group -->
      </div>

      <button type="button" class="btn btn-secondary add-modifier-choice-btn" data-idx="${groupIdx}" style="align-self: flex-start; padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 4px; margin-top: 4px;">
        <i data-lucide="plus" style="width: 12px; height: 12px;"></i>
        <span>Add Choice</span>
      </button>
    `;

    // Populate inner modifier choices
    const listContainer = groupEl.querySelector('.modifiers-list-container');
    const modifiers = group.modifiers || [];
    
    if (modifiers.length === 0) {
      listContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 11px; font-style: italic; padding-left: 4px;">No choices added yet.</p>';
    } else {
      modifiers.forEach((mod, modIdx) => {
        const modRow = document.createElement('div');
        modRow.className = 'modifier-row';
        modRow.innerHTML = `
          <input type="text" class="mod-name-input" placeholder="e.g. Medium, Cheese" value="${mod.name || ''}" data-group-idx="${groupIdx}" data-mod-idx="${modIdx}" style="padding: 6px 10px; font-size: 12px;">
          <input type="number" class="mod-price-input" placeholder="Price offset (₹)" value="${mod.price !== undefined ? mod.price : 0}" data-group-idx="${groupIdx}" data-mod-idx="${modIdx}" style="padding: 6px 10px; font-size: 12px;" step="1">
          
          <button type="button" class="btn btn-secondary btn-icon move-mod-up" data-group-idx="${groupIdx}" data-mod-idx="${modIdx}" title="Move Up">
            <i data-lucide="arrow-up" style="width: 12px; height: 12px;"></i>
          </button>
          <button type="button" class="btn btn-secondary btn-icon move-mod-down" data-group-idx="${groupIdx}" data-mod-idx="${modIdx}" title="Move Down">
            <i data-lucide="arrow-down" style="width: 12px; height: 12px;"></i>
          </button>
          <button type="button" class="btn btn-danger btn-icon delete-mod" data-group-idx="${groupIdx}" data-mod-idx="${modIdx}" title="Delete Choice">
            <i data-lucide="x" style="width: 12px; height: 12px;"></i>
          </button>
        `;
        listContainer.appendChild(modRow);
      });
    }

    container.appendChild(groupEl);
  });

  // Bind change events to sync input data back to array
  container.querySelectorAll('.group-name-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      editingModifierGroups[idx].groupName = e.target.value;
    });
  });

  container.querySelectorAll('.group-required-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      editingModifierGroups[idx].required = e.target.checked;
    });
  });

  container.querySelectorAll('.group-multiselect-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      editingModifierGroups[idx].multiSelect = e.target.checked;
    });
  });

  container.querySelectorAll('.mod-name-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const gIdx = parseInt(e.target.dataset.groupIdx);
      const mIdx = parseInt(e.target.dataset.modIdx);
      editingModifierGroups[gIdx].modifiers[mIdx].name = e.target.value;
    });
  });

  container.querySelectorAll('.mod-price-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const gIdx = parseInt(e.target.dataset.groupIdx);
      const mIdx = parseInt(e.target.dataset.modIdx);
      editingModifierGroups[gIdx].modifiers[mIdx].price = parseFloat(e.target.value) || 0;
    });
  });

  // Bind buttons click events
  // Add modifier choice
  container.querySelectorAll('.add-modifier-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const gIdx = parseInt(btn.dataset.idx);
      if (!editingModifierGroups[gIdx].modifiers) {
        editingModifierGroups[gIdx].modifiers = [];
      }
      editingModifierGroups[gIdx].modifiers.push({
        id: 'mod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: '',
        price: 0
      });
      renderModifierGroupsUI();
    });
  });

  // Reordering groups
  container.querySelectorAll('.move-group-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx > 0) {
        const temp = editingModifierGroups[idx];
        editingModifierGroups[idx] = editingModifierGroups[idx - 1];
        editingModifierGroups[idx - 1] = temp;
        renderModifierGroupsUI();
      }
    });
  });
  container.querySelectorAll('.move-group-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx < editingModifierGroups.length - 1) {
        const temp = editingModifierGroups[idx];
        editingModifierGroups[idx] = editingModifierGroups[idx + 1];
        editingModifierGroups[idx + 1] = temp;
        renderModifierGroupsUI();
      }
    });
  });

  // Deleting groups
  container.querySelectorAll('.delete-group').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      editingModifierGroups.splice(idx, 1);
      renderModifierGroupsUI();
    });
  });

  // Reordering modifiers in a group
  container.querySelectorAll('.move-mod-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const gIdx = parseInt(btn.dataset.groupIdx);
      const mIdx = parseInt(btn.dataset.modIdx);
      if (mIdx > 0) {
        const mods = editingModifierGroups[gIdx].modifiers;
        const temp = mods[mIdx];
        mods[mIdx] = mods[mIdx - 1];
        mods[mIdx - 1] = temp;
        renderModifierGroupsUI();
      }
    });
  });
  container.querySelectorAll('.move-mod-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const gIdx = parseInt(btn.dataset.groupIdx);
      const mIdx = parseInt(btn.dataset.modIdx);
      const mods = editingModifierGroups[gIdx].modifiers;
      if (mIdx < mods.length - 1) {
        const temp = mods[mIdx];
        mods[mIdx] = mods[mIdx + 1];
        mods[mIdx + 1] = temp;
        renderModifierGroupsUI();
      }
    });
  });

  // Deleting modifiers in a group
  container.querySelectorAll('.delete-mod').forEach(btn => {
    btn.addEventListener('click', () => {
      const gIdx = parseInt(btn.dataset.groupIdx);
      const mIdx = parseInt(btn.dataset.modIdx);
      editingModifierGroups[gIdx].modifiers.splice(mIdx, 1);
      renderModifierGroupsUI();
    });
  });

  if (window.lucide) window.lucide.createIcons();
};

const handleAddModifierGroup = () => {
  editingModifierGroups.push({
    groupId: 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    groupName: '',
    required: false,
    multiSelect: false,
    modifiers: []
  });
  renderModifierGroupsUI();
};

const handleSaveModifiersSubmit = async () => {
  // Validate structure
  for (let i = 0; i < editingModifierGroups.length; i++) {
    const group = editingModifierGroups[i];
    if (!group.groupName || group.groupName.trim() === '') {
      alert(`Modifier group #${i + 1} is missing a name.`);
      return;
    }
    const modifiers = group.modifiers || [];
    if (modifiers.length === 0) {
      alert(`Modifier group "${group.groupName}" must have at least one choice.`);
      return;
    }
    for (let j = 0; j < modifiers.length; j++) {
      if (!modifiers[j].name || modifiers[j].name.trim() === '') {
        alert(`Option #${j + 1} inside group "${group.groupName}" is missing a name.`);
        return;
      }
    }
  }

  try {
    toggleModal(document.getElementById('modifiers-modal'), false);
    const existingItem = menuItemsList.find(item => item.id === modifierEditingItemId);
    if (existingItem) {
      const payload = {
        category_id: existingItem.category_id,
        category_name: existingItem.category_name,
        name: existingItem.name,
        description: existingItem.description || '',
        price: existingItem.price,
        prep_time: existingItem.prep_time || 15,
        tags: existingItem.tags || [],
        allergens: existingItem.allergens || [],
        image: existingItem.image || '',
        is_available: existingItem.is_available,
        modifierGroups: editingModifierGroups
      };
      await saveMenuItem(modifierEditingItemId, payload);
      showAlert("Modifier configuration saved successfully.");
    }
  } catch (err) {
    alert("Failed to save modifiers: " + err.message);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('menu-builder', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initMenuBuilder();
  });
});
