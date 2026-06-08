import { 
  auth,
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc,
  setDoc,
  updateDoc,
  query, 
  where,
  onSnapshot,
  onAuthStateChanged
} from './firebase-config.js';
import { restaurantConfig } from './config.js';
import { getGuest, saveGuest } from './db.js';

// DOM elements cache
const menuLoading = document.getElementById('menu-loading');
const menuError = document.getElementById('menu-error');
const errorMessage = document.getElementById('error-message');
const menuContainer = document.getElementById('menu-container');
const orderCompletedPanel = document.getElementById('order-completed-panel');

const menuRestaurantName = document.getElementById('menu-restaurant-name');
const menuRestaurantLogo = document.getElementById('menu-restaurant-logo');
const menuRestaurantDesc = document.getElementById('menu-restaurant-desc');
const menuCategoryTabs = document.getElementById('menu-category-tabs');
const menuItemsList = document.getElementById('menu-items-list');
const menuSearchInput = document.getElementById('menu-search-input');

// Cart DOM
const floatingCartBar = document.getElementById('floating-cart-bar');
const cartCounter = document.getElementById('cart-counter');
const cartTotalPrice = document.getElementById('cart-total-price');

const cartModalBackdrop = document.getElementById('cart-modal-backdrop');
const cartDrawer = document.getElementById('cart-drawer');
const cartItemsContainer = document.getElementById('cart-items-container');
const drawerSubtotal = document.getElementById('drawer-subtotal');

const openCartBtn = document.getElementById('open-cart-btn');
const closeCartBtns = document.querySelectorAll('#close-cart-btn');
const placeOrderBtn = document.getElementById('place-order-btn');
const trackOrderBtn = document.getElementById('track-order-btn');

// Instruction modal DOM
const instructionModal = document.getElementById('instruction-modal');
const closeInstructionModal = document.getElementById('close-instruction-modal');
const instructionDishName = document.getElementById('instruction-dish-name');
const instructionTextarea = document.getElementById('instruction-textarea');
const saveInstructionBtn = document.getElementById('save-instruction-btn');

// Tracker DOM
const trackerContainer = document.getElementById('tracker-container');
const trackerOrderId = document.getElementById('tracker-order-id');
const trackerTableNumber = document.getElementById('tracker-table-number');
const trackerStatusText = document.getElementById('tracker-status-text');
const progressLineFill = document.getElementById('progress-line-fill');
const trackerItemsList = document.getElementById('tracker-items-list');
const trackerBackBtn = document.getElementById('tracker-back-btn');
const stepNodes = document.querySelectorAll('.step-node');

// URL params parsed context
const getUrlParams = () => new URLSearchParams(window.location.search);
let tableId = getUrlParams().get('t');
let orderId = getUrlParams().get('o');

// Guest registration DOM
const guestRegisterScreen = document.getElementById('guest-register-screen');
const guestRegisterForm   = document.getElementById('guest-register-form');
const grName              = document.getElementById('gr-name');
const grMobile            = document.getElementById('gr-mobile');
const grSubmitBtn         = document.getElementById('gr-submit-btn');
const grError             = document.getElementById('gr-error');
const grErrorText         = document.getElementById('gr-error-text');
const grRestaurantName    = document.getElementById('gr-restaurant-name');

// Active local states
let activeSettings = restaurantConfig;
let tableNumber = '';
let categories = [];
let menuItems = [];
let cart = [];

// Guest state
let guestName   = '';
let guestMobile = '';

let activeInstructionItemId = null;
let selectedCategory = 'all';
let searchQuery = '';
let trackerUnsubscribe = null;

// Status constants for tracker
const statuses = ['received', 'preparing', 'ready', 'served'];
const statusLabels = {
  received: 'Received',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  settled: 'Paid & Settled',
  cancelled: 'Cancelled',
};

const initPage = async () => {
  // Initialize icons
  if (window.lucide) window.lucide.createIcons();

  // Check auth state to show Waiter Back Buttons
  if (auth) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const role = userDoc.data().role;
            if (role === 'waiter' || role === 'owner' || role === 'manager' || role === 'cashier') {
              // 1. Show waiter header nav bar
              const waiterNavBar = document.getElementById('waiter-nav-bar');
              if (waiterNavBar) {
                waiterNavBar.classList.remove('hidden');
                waiterNavBar.style.display = 'flex';
                const staffTag = document.getElementById('waiter-staff-tag');
                if (staffTag) {
                  staffTag.innerText = `${userDoc.data().name || 'Staff'} (${role.toUpperCase()})`;
                }
              }
              // 2. Show waiter completed screen back button
              const waiterCompletedBackBtn = document.getElementById('waiter-completed-back-btn');
              if (waiterCompletedBackBtn) {
                waiterCompletedBackBtn.classList.remove('hidden');
                waiterCompletedBackBtn.style.display = 'flex';
              }
              // 3. Show waiter tracker screen back button
              const waiterTrackerBackBtn = document.getElementById('waiter-tracker-back-btn');
              if (waiterTrackerBackBtn) {
                waiterTrackerBackBtn.classList.remove('hidden');
                waiterTrackerBackBtn.style.display = 'flex';
              }
              if (window.lucide) window.lucide.createIcons();
            }
          }
        } catch (err) {
          console.error("Failed to load staff details for back button:", err);
        }
      }
    });
  }

  const params = getUrlParams();
  orderId = params.get('o');
  tableId = params.get('t');

  if (orderId) {
    // Direct tracker link — skip guest check
    initTrackerMode(orderId);
    return;
  }

  let isTableFree = false;
  let activeGuestNameFromTable = '';
  let activeGuestMobileFromTable = '';

  if (tableId) {
    try {
      const tableDoc = await getDoc(doc(db, 'tables', tableId));
      if (tableDoc.exists()) {
        tableNumber = tableDoc.data().table_number;
        const status = tableDoc.data().status || 'free';
        if (status === 'free') {
          isTableFree = true;
          // Reset guest details state for the new session
          guestName = '';
          guestMobile = '';
        } else {
          activeGuestNameFromTable = tableDoc.data().current_guest_name || '';
          activeGuestMobileFromTable = tableDoc.data().current_guest_mobile || '';
        }
      }
    } catch (err) {
      console.error('Failed to resolve table status during init:', err);
    }
  }

  // ── Guest check ────────────────────────────────────────────────────────────
  const storedMobile = localStorage.getItem('ros_guest_mobile');
  const storedName   = localStorage.getItem('ros_guest_name');

  // 1. First priority: Check if table document has active guest details
  if (!isTableFree && activeGuestNameFromTable && activeGuestMobileFromTable) {
    guestName = activeGuestNameFromTable;
    guestMobile = activeGuestMobileFromTable;
    localStorage.setItem('ros_guest_name', guestName);
    localStorage.setItem('ros_guest_mobile', guestMobile);
    initMenuMode();
    return;
  }

  // 2. Second priority: Fall back to local storage (if occupied but table missing fields)
  if (!isTableFree && storedMobile && storedName) {
    // Returning guest — verify in Firestore
    let guest = await getGuest(storedMobile);
    if (!guest) {
      try {
        guest = await saveGuest(storedMobile, storedName);
      } catch (err) {
        console.error("Failed to restore guest profile in Firestore:", err);
      }
    }
    if (guest) {
      guestName   = guest.name;
      guestMobile = storedMobile;
      // Update visit count silently
      saveGuest(storedMobile, guest.name).catch(() => {});
      
      // Update table document in background if missing guest details but occupied
      if (tableId) {
        updateDoc(doc(db, 'tables', tableId), {
          current_guest_name: guestName,
          current_guest_mobile: guestMobile
        }).catch(() => {});
      }
      
      initMenuMode();
      return;
    }
  }

  // Pre-fill inputs for returning guests for their convenience
  if (storedMobile && grMobile) grMobile.value = storedMobile;
  if (storedName && grName) grName.value = storedName;

  // New guest or new table session — show registration screen
  menuLoading.style.display = 'none';
  guestRegisterScreen.classList.remove('hidden');

  // Pre-fill restaurant name in form
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'restaurant'));
    const name = settingsDoc.exists() ? settingsDoc.data().name : restaurantConfig.name;
    if (grRestaurantName) grRestaurantName.innerText = `Welcome to ${name}!`;
  } catch (_) {
    if (grRestaurantName) grRestaurantName.innerText = `Welcome to ${restaurantConfig.name}!`;
  }

  if (window.lucide) window.lucide.createIcons();

  // Bind registration form
  if (guestRegisterForm) {
    guestRegisterForm.addEventListener('submit', handleGuestRegister);
  }
};

// ── Guest Registration Handler ──────────────────────────────────────────────
const handleGuestRegister = async (e) => {
  e.preventDefault();

  const name   = grName.value.trim();
  const mobile = grMobile.value.trim();

  // Validate mobile — must be exactly 10 digits
  if (!/^[0-9]{10}$/.test(mobile)) {
    grError.classList.remove('hidden');
    grErrorText.innerText = 'Please enter a valid 10-digit mobile number.';
    return;
  }
  if (!name) {
    grError.classList.remove('hidden');
    grErrorText.innerText = 'Please enter your name.';
    return;
  }

  grError.classList.add('hidden');
  grSubmitBtn.disabled = true;
  grSubmitBtn.innerHTML = '<div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 1s linear infinite; margin: 0 auto;"></div>';

  try {
    await saveGuest(mobile, name);

    // Persist to localStorage for next visit
    localStorage.setItem('ros_guest_mobile', mobile);
    localStorage.setItem('ros_guest_name', name);

    guestName   = name;
    guestMobile = mobile;

    // Hide registration, show menu
    guestRegisterScreen.classList.add('hidden');
    
    // Set table to occupied with session details in Firestore
    if (tableId) {
      await updateDoc(doc(db, 'tables', tableId), {
        status: 'occupied',
        current_guest_name: name,
        current_guest_mobile: mobile
      });
    }

    initMenuMode();
  } catch (err) {
    console.error("Guest registration failed:", err);
    grError.classList.remove('hidden');
    grErrorText.innerText = `Error: ${err.message || 'Something went wrong. Please try again.'}`;
    grSubmitBtn.disabled = false;
    grSubmitBtn.innerHTML = '<i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i><span>Continue to Menu</span>';
    if (window.lucide) window.lucide.createIcons();
  }
};

// ==========================================================================
// MENU CATALOG MODE
// ==========================================================================
const initMenuMode = async () => {
  try {
    // 1. Fetch dynamic settings
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'restaurant'));
      if (settingsDoc.exists()) {
        activeSettings = settingsDoc.data();
      } else {
        const localSettings = localStorage.getItem('settings_restaurant');
        if (localSettings) {
          activeSettings = JSON.parse(localSettings);
        }
      }
    } catch (err) {
      console.warn('Could not load Firestore settings, using local fallback:', err);
      const localSettings = localStorage.getItem('settings_restaurant');
      if (localSettings) {
        activeSettings = JSON.parse(localSettings);
      }
    }

    if (menuRestaurantName) menuRestaurantName.innerText = activeSettings.name;
    if (menuRestaurantLogo && activeSettings.logoUrl) {
      menuRestaurantLogo.src = activeSettings.logoUrl;
      menuRestaurantLogo.style.display = 'block';
    }
    if (menuRestaurantDesc && activeSettings.description) {
      menuRestaurantDesc.innerText = activeSettings.description;
    }

    // 2. Fetch table details if tableId exists & mark table as occupied only if needed (saves writes)
    if (tableId) {
      try {
        const tableDoc = await getDoc(doc(db, 'tables', tableId));
        if (tableDoc.exists()) {
          tableNumber = tableDoc.data().table_number;
          const currentStatus = tableDoc.data().status;
          
          // Only update table to occupied if it isn't already (saves a write)
          if (currentStatus !== 'occupied') {
            await updateDoc(doc(db, 'tables', tableId), {
              status: 'occupied',
              current_guest_name: guestName,
              current_guest_mobile: guestMobile
            });
          }
        }
      } catch (err) {
        console.error('Failed to resolve table number:', err);
      }
    }

    // 3 & 4. Fetch Categories & Available Menu Items (with a 5-minute local cache to save reads)
    const cacheTime = localStorage.getItem('ros_menu_cache_time');
    const now = Date.now();
    let useCache = false;

    if (cacheTime && (now - parseInt(cacheTime) < 3600000)) { // 1 hour TTL
      const cachedCats = localStorage.getItem('ros_menu_categories');
      const cachedItems = localStorage.getItem('ros_menu_items');
      if (cachedCats && cachedItems) {
        categories = JSON.parse(cachedCats);
        menuItems = JSON.parse(cachedItems);
        useCache = true;
      }
    }

    if (!useCache) {
      // Fetch Categories from Firestore
      const catsSnap = await getDocs(collection(db, 'menu_categories'));
      categories = catsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.display_order - b.display_order);

      // Fetch Available Menu Items from Firestore
      const itemsQuery = query(
        collection(db, 'menu_items'), 
        where('is_available', '==', true)
      );
      const itemsSnap = await getDocs(itemsQuery);
      menuItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Update local cache
      localStorage.setItem('ros_menu_categories', JSON.stringify(categories));
      localStorage.setItem('ros_menu_items', JSON.stringify(menuItems));
      localStorage.setItem('ros_menu_cache_time', now.toString());
    }

    // 5. Render elements
    renderCategoryTabs();
    renderMenuItems();
    setupMenuListeners();

    // Toggle screen visibility
    menuLoading.classList.add('hidden');
    trackerContainer.classList.add('hidden');
    orderCompletedPanel.classList.add('hidden');
    menuContainer.classList.remove('hidden');

    // Refresh icons
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('Failed to load menu details:', err);
    showError('Failed to load menu. Please check your connection and try again.');
  }
};

const renderCategoryTabs = () => {
  if (!menuCategoryTabs) return;
  menuCategoryTabs.innerHTML = '';

  // "All Items" tab
  const allBtn = document.createElement('button');
  allBtn.className = `category-tab ${selectedCategory === 'all' ? 'active' : ''}`;
  allBtn.innerText = 'All Items';
  allBtn.addEventListener('click', () => {
    selectedCategory = 'all';
    renderCategoryTabs();
    renderMenuItems();
  });
  menuCategoryTabs.appendChild(allBtn);

  // Mapped categories
  categories.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `category-tab ${selectedCategory === c.id ? 'active' : ''}`;
    btn.innerText = c.name;
    btn.addEventListener('click', () => {
      selectedCategory = c.id;
      renderCategoryTabs();
      renderMenuItems();
    });
    menuCategoryTabs.appendChild(btn);
  });
};

const renderMenuItems = () => {
  if (!menuItemsList) return;
  menuItemsList.innerHTML = '';

  const curSymbol = activeSettings.currency || '₹';

  const filtered = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    menuItemsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 48px 0;">No dishes found matching selection.</p>';
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass-panel menu-item-card animate-slide-up';
    card.style.display = 'flex';
    card.style.gap = '16px';
    card.style.padding = '16px';
    card.style.position = 'relative';
    card.style.overflow = 'hidden';
    
    card.innerHTML = `
      ${item.image ? `
        <img src="${item.image}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" alt="${item.name}">
      ` : ''}
      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px; text-align: left;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${item.tags?.includes('Veg') ? 'var(--success)' : 'var(--danger)'}"></span>
          <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">${item.category_name}</span>
        </div>
        <h4 style="font-size: 16px; font-weight: 700; color: #fff; margin-top: 2px;">${item.name}</h4>
        <p style="font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 2px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-overflow: ellipsis; max-width: 280px;">${item.description || ''}</p>
        <div style="font-size: 14px; font-weight: 750; color: #fff; margin-top: 8px;">${curSymbol}${parseFloat(item.price.toString()).toFixed(2)}</div>
      </div>
      <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; shrink-0;">
        <button class="btn-chef-note" data-id="${item.id}" title="Add Chef Instruction" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;">
          <i data-lucide="pencil-line" style="width: 16px; height: 16px;"></i>
        </button>
        <button class="btn btn-primary btn-add-cart" style="padding: 6px 14px; font-size: 12px;" data-id="${item.id}">
          Add +
        </button>
      </div>
    `;

    card.querySelector('.btn-add-cart').addEventListener('click', () => {
      addToCart(item);
    });

    card.querySelector('.btn-chef-note').addEventListener('click', () => {
      openInstructionModal(item);
    });

    menuItemsList.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons();
};

const addToCart = (item, instruction = '') => {
  const existing = cart.find(i => i.menuItem.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ menuItem: item, quantity: 1, specialInstruction: instruction });
  }
  updateCartUI();
};

const updateQuantity = (itemId, amount) => {
  const item = cart.find(i => i.menuItem.id === itemId);
  if (item) {
    item.quantity += amount;
    if (item.quantity <= 0) {
      cart = cart.filter(i => i.menuItem.id !== itemId);
    }
  }
  updateCartUI();
};

const updateCartUI = () => {
  const count = cart.reduce((acc, item) => acc + item.quantity, 0);
  const total = cart.reduce((acc, item) => acc + (item.menuItem.price * item.quantity), 0);
  const curSymbol = activeSettings.currency || '₹';

  if (count > 0) {
    if (cartCounter) cartCounter.innerText = count;
    if (cartTotalPrice) cartTotalPrice.innerText = `Subtotal: ${curSymbol}${total.toFixed(2)}`;
    floatingCartBar.classList.remove('hidden');
  } else {
    floatingCartBar.classList.add('hidden');
    toggleCartDrawer(false);
  }

  if (cartItemsContainer) {
    cartItemsContainer.innerHTML = '';
    
    cart.forEach(item => {
      const el = document.createElement('div');
      el.className = 'glass-panel';
      el.style.padding = '14px';
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      el.style.gap = '8px';
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; text-align: left;">
          <div>
            <h4 style="font-size: 14px; font-weight: 700; color: #fff;">${item.menuItem.name}</h4>
            <span style="font-size: 11px; color: var(--text-muted);">${curSymbol}${item.menuItem.price} each</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; background: hsla(222, 47%, 2%, 0.8); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 8px; font-size: 13px;">
            <button class="btn-qty-minus font-bold text-slate-400 hover:text-slate-200" data-id="${item.menuItem.id}" style="background: transparent; border: none; cursor: pointer;">-</button>
            <span style="font-weight: 700; color: #fff;">${item.quantity}</span>
            <button class="btn-qty-plus font-bold text-slate-400 hover:text-slate-200" data-id="${item.menuItem.id}" style="background: transparent; border: none; cursor: pointer;">+</button>
          </div>
        </div>
        ${item.specialInstruction ? `
          <div style="background: hsla(262, 83%, 18%, 0.15); border: 1px solid hsla(262, 83%, 38%, 0.2); padding: 6px 10px; border-radius: 6px; font-size: 11px; color: var(--primary-hover); font-style: italic; text-align: left;">
            Note: ${item.specialInstruction}
          </div>
        ` : ''}
      `;
      
      el.querySelector('.btn-qty-minus').addEventListener('click', () => updateQuantity(item.menuItem.id, -1));
      el.querySelector('.btn-qty-plus').addEventListener('click', () => updateQuantity(item.menuItem.id, 1));
      
      cartItemsContainer.appendChild(el);
    });

    drawerSubtotal.innerText = `${curSymbol}${total.toFixed(2)}`;
  }
};

const toggleCartDrawer = (open) => {
  if (open) {
    cartModalBackdrop.classList.add('active');
    cartDrawer.classList.add('active');
  } else {
    cartModalBackdrop.classList.remove('active');
    cartDrawer.classList.remove('active');
  }
};

// Instruction modal actions
const openInstructionModal = (item) => {
  activeInstructionItemId = item.id;
  instructionDishName.innerText = item.name;
  
  const existing = cart.find(i => i.menuItem.id === item.id);
  instructionTextarea.value = existing?.specialInstruction || '';
  
  instructionModal.classList.add('active');
};

const handleSaveInstruction = () => {
  if (activeInstructionItemId) {
    const itemInCart = cart.find(i => i.menuItem.id === activeInstructionItemId);
    const note = instructionTextarea.value.trim();

    if (itemInCart) {
      itemInCart.specialInstruction = note;
    } else {
      const item = menuItems.find(i => i.id === activeInstructionItemId);
      if (item) {
        cart.push({ menuItem: item, quantity: 1, specialInstruction: note });
      }
    }
    updateCartUI();
  }
  instructionModal.classList.remove('active');
  activeInstructionItemId = null;
  instructionTextarea.value = '';
};

// Place Order
const resetPlaceOrderBtn = () => {
  if (!placeOrderBtn) return;
  placeOrderBtn.disabled = false;
  placeOrderBtn.innerHTML = '<span>Send Order to Kitchen</span><i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
  if (window.lucide) window.lucide.createIcons();
};

const handlePlaceOrder = async () => {
  if (cart.length === 0) return;
  
  placeOrderBtn.disabled = true;
  placeOrderBtn.innerHTML = '<div style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 1s linear infinite; margin: 0 auto;"></div>';

  try {
    const payload = {
      table_id: tableId || '',
      table_number: tableNumber || 'Takeaway',
      customer_name: guestName || 'Guest',
      customer_mobile: guestMobile || '',
      status: 'received',
      items: cart.map(i => ({
        item_id: i.menuItem.id,
        name: i.menuItem.name,
        quantity: i.quantity,
        price: i.menuItem.price,
        special_instruction: i.specialInstruction || null
      })),
      created_at: new Date()
    };

    const docRef = await addDoc(collection(db, 'orders'), payload);
    const newOrderId = docRef.id;

    // Table is already occupied from initial load, no need to rewrite status here

    // Clear cart
    cart = [];
    updateCartUI();
    toggleCartDrawer(false);

    // ── Reset button so it works for next order ──
    resetPlaceOrderBtn();

    // Transition to order placed completion screen
    menuContainer.classList.add('hidden');
    orderCompletedPanel.classList.remove('hidden');

    trackOrderBtn.onclick = () => {
      // Transition to tracker mode
      orderCompletedPanel.classList.add('hidden');
      initTrackerMode(newOrderId);
    };

  } catch (err) {
    console.error('Failed to submit order:', err);
    alert('Failed to place order. Please try again.');
    resetPlaceOrderBtn();
  }
};

const setupMenuListeners = () => {
  // Theme Toggle logic
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    const sunIcon = document.getElementById('theme-sun-icon');
    const moonIcon = document.getElementById('theme-moon-icon');
    
    const currentTheme = localStorage.getItem('ros_theme') || 'dark';
    if (currentTheme === 'light') {
      if (sunIcon) sunIcon.style.display = 'none';
      if (moonIcon) moonIcon.style.display = 'block';
    } else {
      if (sunIcon) sunIcon.style.display = 'block';
      if (moonIcon) moonIcon.style.display = 'none';
    }

    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.contains('light-theme');
      if (isLight) {
        document.documentElement.classList.remove('light-theme');
        localStorage.setItem('ros_theme', 'dark');
        if (sunIcon) sunIcon.style.display = 'block';
        if (moonIcon) moonIcon.style.display = 'none';
      } else {
        document.documentElement.classList.add('light-theme');
        localStorage.setItem('ros_theme', 'light');
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'block';
      }
    });
  }

  if (menuSearchInput) {
    menuSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderMenuItems();
    });
  }

  if (openCartBtn) openCartBtn.addEventListener('click', () => toggleCartDrawer(true));
  closeCartBtns.forEach(btn => btn.addEventListener('click', () => toggleCartDrawer(false)));
  
  if (placeOrderBtn) placeOrderBtn.addEventListener('click', handlePlaceOrder);

  if (closeInstructionModal) {
    closeInstructionModal.addEventListener('click', () => {
      instructionModal.classList.remove('active');
      activeInstructionItemId = null;
    });
  }
  if (saveInstructionBtn) saveInstructionBtn.addEventListener('click', handleSaveInstruction);
};


// ==========================================================================
// ORDER TRACKER MODE
// ==========================================================================
const initTrackerMode = (trackId) => {
  // Hide loading/menu UI, show tracker UI
  menuLoading.classList.add('hidden');
  menuContainer.classList.add('hidden');
  orderCompletedPanel.classList.add('hidden');
  trackerContainer.classList.remove('hidden');

  // Push to URL state
  const curParams = getUrlParams();
  curParams.set('o', trackId);
  window.history.pushState({}, '', `${window.location.pathname}?${curParams.toString()}`);

  if (window.lucide) window.lucide.createIcons();

  // Reset tracking subscription if active
  if (trackerUnsubscribe) {
    trackerUnsubscribe();
    trackerUnsubscribe = null;
  }

  // Subscribe to live status in Firestore
  trackerUnsubscribe = onSnapshot(doc(db, 'orders', trackId), (docSnap) => {
    if (!docSnap.exists()) {
      showError('Order not found. Please verify the link.');
      return;
    }

    const order = docSnap.data();

    if (trackerTableNumber) trackerTableNumber.innerText = order.table_number || 'Takeaway';
    if (trackerOrderId) trackerOrderId.innerText = `ID: #${docSnap.id.slice(0, 8).toUpperCase()}`;
    
    // Status label
    if (trackerStatusText) {
      if (order.status === 'cancelled') {
        trackerStatusText.innerText = 'Cancelled';
        trackerStatusText.style.color = 'var(--danger)';
      } else {
        trackerStatusText.innerText = statusLabels[order.status] || order.status;
        trackerStatusText.style.color = '';
      }
    }

    // Render items checklist
    renderTrackerItems(order.items || []);

    // Update steps bar nodes
    updateTrackerProgress(order.status);

    if (window.lucide) window.lucide.createIcons();
  }, (err) => {
    console.error('Failed to sync order tracker:', err);
    showError('Connection lost. Please check your network.');
  });
};

const renderTrackerItems = (items) => {
  if (!trackerItemsList) return;
  trackerItemsList.innerHTML = '';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'glass-panel';
    el.style.padding = '12px 16px';
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.innerHTML = `
      <div style="text-align: left;">
        <h5 style="font-size: 14px; font-weight: 600; color: #fff;">${item.name}</h5>
        ${item.special_instruction ? `<p style="font-size: 10px; color: var(--primary-hover); font-style: italic; margin-top: 2px;">Note: ${item.special_instruction}</p>` : ''}
      </div>
      <span class="badge" style="background: hsla(222, 47%, 2%, 0.8); color: var(--text-muted); border-color: var(--border-color); font-size: 12px; font-weight: 700; border-radius: 8px;">
        Qty: ${item.quantity}
      </span>
    `;
    trackerItemsList.appendChild(el);
  });
};

const updateTrackerProgress = (currentStatus) => {
  if (!progressLineFill) return;

  if (currentStatus === 'cancelled') {
    progressLineFill.style.width = '0%';
    stepNodes.forEach(node => {
      const icon = node.querySelector('div');
      const label = node.querySelector('span');
      if (icon) {
        icon.style.background = 'var(--bg-main)';
        icon.style.borderColor = 'var(--border-color)';
        icon.style.color = 'var(--text-muted)';
        icon.style.boxShadow = 'none';
        icon.classList.remove('scale-110', 'ring-4', 'ring-brand-500/20');
      }
      if (label) label.style.color = 'var(--text-muted)';
    });
    return;
  }

  const activeIdx = statuses.indexOf(currentStatus);
  const percentage = activeIdx >= 0 ? (activeIdx / (statuses.length - 1)) * 100 : 0;
  progressLineFill.style.width = `${percentage}%`;

  stepNodes.forEach(node => {
    const idx = parseInt(node.dataset.step);
    const isPassed = activeIdx >= idx;
    const isActive = activeIdx === idx;

    const icon = node.querySelector('div');
    const label = node.querySelector('span');

    if (icon) {
      if (isPassed) {
        icon.style.background = 'var(--primary)';
        icon.style.borderColor = 'var(--primary-hover)';
        icon.style.color = '#fff';
        icon.style.boxShadow = '0 4px 14px var(--primary-glow)';
        if (isActive) {
          icon.classList.add('scale-110');
          icon.style.boxShadow = '0 4px 14px var(--primary-glow), 0 0 0 4px hsla(262, 83%, 58%, 0.2)';
        } else {
          icon.classList.remove('scale-110');
        }
      } else {
        icon.style.background = 'var(--bg-main)';
        icon.style.borderColor = 'var(--border-color)';
        icon.style.color = 'var(--text-muted)';
        icon.style.boxShadow = 'none';
        icon.classList.remove('scale-110');
      }
    }

    if (label) {
      if (isPassed) {
        label.style.color = 'var(--primary-hover)';
      } else {
        label.style.color = 'var(--text-muted)';
      }
    }
  });
};

const showError = (msg) => {
  menuLoading.classList.add('hidden');
  menuContainer.classList.add('hidden');
  trackerContainer.classList.add('hidden');
  errorMessage.innerText = msg;
  menuError.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
};

// Back to menu handler
if (trackerBackBtn) {
  trackerBackBtn.addEventListener('click', () => {
    // Stop tracker subscription
    if (trackerUnsubscribe) {
      trackerUnsubscribe();
      trackerUnsubscribe = null;
    }

    // Update URL to remove order ID
    const curParams = getUrlParams();
    curParams.delete('o');
    window.history.pushState({}, '', `${window.location.pathname}?${curParams.toString()}`);

    // Reset the place order button before going back to menu
    resetPlaceOrderBtn();

    // Check if guest info is present, otherwise force guest registration
    const storedMobile = localStorage.getItem('ros_guest_mobile');
    const storedName   = localStorage.getItem('ros_guest_name');

    if (storedMobile && storedName) {
      initMenuMode();
    } else {
      trackerContainer.classList.add('hidden');
      initPage();
    }
  });
}

// Cleanup on beforeunload
window.addEventListener('beforeunload', () => {
  if (trackerUnsubscribe) trackerUnsubscribe();
});

// Start
window.addEventListener('DOMContentLoaded', initPage);
