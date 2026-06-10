// Cashier POS billing checkout controller for order.html protected panel
import { initAuthGuard } from './auth.js';
import { createCustomerOrder, updateOrderStatus, updateTableStatus } from './db.js';
import { subscribeTables, subscribeCategories, subscribeItems, subscribeAllOrders } from './realtime.js';
import { toggleModal, showAlert, formatPrice } from './utils.js';
import { printReceipt } from './printer.js';

let activeUser = null;
let activeRestaurant = null;

// Caches
let tablesList = [];
let categoriesList = [];
let menuItems = [];
let activeOrders = [];

// Unsubscribe handles
let tablesUnsubscribe = null;
let categoriesUnsubscribe = null;
let itemsUnsubscribe = null;
let ordersUnsubscribe = null;

// Local state
let selectedTableId = '';
let cart = [];
let discountType = 'none'; // 'none', 'flat', 'percent', 'item'
let discountValue = 0;
let discountItemId = '';
let discountAmount = 0;
let activeCategoryFilter = 'all';
let searchQuery = '';

// DOM references
const tableSelect = document.getElementById('tables-select');
const categoriesScroll = document.getElementById('categories-tabs');
const catalogGrid = document.getElementById('catalog-grid');
const searchDishesInput = document.getElementById('search-dishes');
const cartItemsWrapper = document.getElementById('cart-items-wrapper');

const subtotalSpan = document.getElementById('checkout-subtotal');
const cgstSpan = document.getElementById('checkout-cgst');
const sgstSpan = document.getElementById('checkout-sgst');
const discountAppliedSpan = document.getElementById('checkout-discount-applied');
const grandTotalSpan = document.getElementById('checkout-grand-total');

const btnDiscountNone = document.getElementById('btn-discount-none');
const btnDiscountFlat = document.getElementById('btn-discount-flat');
const btnDiscountPercent = document.getElementById('btn-discount-percent');
const btnDiscountItem = document.getElementById('btn-discount-item');
const discountInputsContainer = document.getElementById('discount-inputs-container');
const discountItemSelect = document.getElementById('discount-item-select');
const discountValueInput = document.getElementById('discount-value-input');

const btnSendKds = document.getElementById('btn-send-kds');
const btnPayPrint = document.getElementById('btn-pay-print');

const initOrderPage = () => {
  // Bind inputs
  if (searchDishesInput) searchDishesInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCatalog();
  });

  if (tableSelect) tableSelect.addEventListener('change', (e) => {
    selectedTableId = e.target.value;
    loadTableCartAndBill();
  });

  const selectDiscountType = (type) => {
    discountType = type;
    [btnDiscountNone, btnDiscountFlat, btnDiscountPercent, btnDiscountItem].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (type === 'none' && btnDiscountNone) btnDiscountNone.classList.add('active');
    if (type === 'flat' && btnDiscountFlat) btnDiscountFlat.classList.add('active');
    if (type === 'percent' && btnDiscountPercent) btnDiscountPercent.classList.add('active');
    if (type === 'item' && btnDiscountItem) btnDiscountItem.classList.add('active');
    
    if (type === 'none') {
      if (discountInputsContainer) discountInputsContainer.style.display = 'none';
      discountValue = 0;
      discountItemId = '';
      if (discountValueInput) discountValueInput.value = '';
    } else {
      if (discountInputsContainer) discountInputsContainer.style.display = 'flex';
      if (type === 'item') {
        if (discountItemSelect) {
          discountItemSelect.style.display = 'block';
          populateDiscountItemSelect();
        }
      } else {
        if (discountItemSelect) {
          discountItemSelect.style.display = 'none';
          discountItemSelect.value = '';
        }
        discountItemId = '';
      }
    }
    calculateCheckoutTotal();
  };

  if (btnDiscountNone) btnDiscountNone.addEventListener('click', () => selectDiscountType('none'));
  if (btnDiscountFlat) btnDiscountFlat.addEventListener('click', () => selectDiscountType('flat'));
  if (btnDiscountPercent) btnDiscountPercent.addEventListener('click', () => selectDiscountType('percent'));
  if (btnDiscountItem) btnDiscountItem.addEventListener('click', () => selectDiscountType('item'));

  if (discountValueInput) discountValueInput.addEventListener('input', (e) => {
    discountValue = parseFloat(e.target.value) || 0;
    calculateCheckoutTotal();
  });

  if (discountItemSelect) discountItemSelect.addEventListener('change', (e) => {
    discountItemId = e.target.value;
    calculateCheckoutTotal();
  });

  if (btnSendKds) btnSendKds.addEventListener('click', handleSendKdsOrder);
  if (btnPayPrint) btnPayPrint.addEventListener('click', handleSettleAndPrintBill);

  const toggleBtn = document.getElementById('toggle-customer-details');
  const detailsFields = document.getElementById('customer-details-fields');
  const chevron = document.getElementById('chevron-customer-details');
  if (toggleBtn && detailsFields) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = detailsFields.style.display === 'none';
      detailsFields.style.display = isHidden ? 'flex' : 'none';
      if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Subscriptions
  if (tablesUnsubscribe) tablesUnsubscribe();
  tablesUnsubscribe = subscribeTables((tables) => {
    tablesList = tables.sort((a, b) => String(a.table_number || '').localeCompare(String(b.table_number || '')));
    populateTablesDropdown();
  });

  if (categoriesUnsubscribe) categoriesUnsubscribe();
  categoriesUnsubscribe = subscribeCategories((categories) => {
    categoriesList = categories.sort((a, b) => a.display_order - b.display_order);
    renderCategoryTabs();
  });

  if (itemsUnsubscribe) itemsUnsubscribe();
  itemsUnsubscribe = subscribeItems((items) => {
    menuItems = items.filter(item => item.is_available === true);
    renderCatalog();
  });

  if (ordersUnsubscribe) ordersUnsubscribe();
  ordersUnsubscribe = subscribeAllOrders((orders) => {
    activeOrders = orders;
    loadTableCartAndBill();
  });
};

const populateTablesDropdown = () => {
  if (!tableSelect) return;
  tableSelect.innerHTML = '<option value="">-- Choose Seating Table --</option>';
  tablesList.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.innerText = `${t.table_number} (${t.status === 'occupied' ? 'Occupied' : 'Free'})`;
    tableSelect.appendChild(opt);
  });
  if (selectedTableId) {
    tableSelect.value = selectedTableId;
  }
};

const renderCategoryTabs = () => {
  if (!categoriesScroll) return;
  categoriesScroll.innerHTML = '';

  // All Items tab
  const allBtn = document.createElement('button');
  allBtn.className = `category-tab ${activeCategoryFilter === 'all' ? 'active' : ''}`;
  allBtn.innerText = 'All Items';
  allBtn.addEventListener('click', () => {
    activeCategoryFilter = 'all';
    renderCategoryTabs();
    renderCatalog();
  });
  categoriesScroll.appendChild(allBtn);

  // List of categories
  categoriesList.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `category-tab ${activeCategoryFilter === c.id ? 'active' : ''}`;
    btn.innerText = c.name;
    btn.addEventListener('click', () => {
      activeCategoryFilter = c.id;
      renderCategoryTabs();
      renderCatalog();
    });
    categoriesScroll.appendChild(btn);
  });
};

const renderCatalog = () => {
  if (!catalogGrid) return;
  catalogGrid.innerHTML = '';

  const filtered = menuItems.filter(item => {
    const matchesCat = activeCategoryFilter === 'all' || item.category_id === activeCategoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    catalogGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No available dishes found.</p>';
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'glass-panel pos-dish-card animate-slide-up';
    card.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${item.tags?.includes('Veg') ? 'var(--success)' : 'var(--danger)'}"></span>
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">${item.category_name}</span>
        </div>
        <h4 style="font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px;">${item.name}</h4>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 8px;">
        <span style="font-size: 13px; font-weight: 700;">${formatPrice(item.price, activeRestaurant?.currency)}</span>
        <button class="btn btn-primary btn-add-to-cart" style="padding: 6px 10px; font-size: 11px;" data-id="${item.id}">Add +</button>
      </div>
    `;
    catalogGrid.appendChild(card);
  });

  catalogGrid.querySelectorAll('.btn-add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = menuItems.find(i => i.id === btn.dataset.id);
      if (item) {
        addToCart(item);
      }
    });
  });
};

const addToCart = (item) => {
  const existing = cart.find(i => i.item_id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      special_instruction: null
    });
  }
  renderCart();
};

const updateCartItemQuantity = (itemId, change) => {
  const row = cart.find(i => i.item_id === itemId);
  if (row) {
    row.quantity += change;
    if (row.quantity <= 0) {
      cart = cart.filter(i => i.item_id !== itemId);
    }
  }
  renderCart();
};

const populateDiscountItemSelect = () => {
  if (!discountItemSelect) return;
  const currentVal = discountItemSelect.value;
  discountItemSelect.innerHTML = '<option value="">-- Choose Item --</option>';
  cart.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.item_id;
    opt.innerText = `${item.name} (${item.quantity}x)`;
    discountItemSelect.appendChild(opt);
  });
  if (cart.some(i => i.item_id === currentVal)) {
    discountItemSelect.value = currentVal;
  } else {
    discountItemId = '';
  }
};

const renderCart = () => {
  if (!cartItemsWrapper) return;
  cartItemsWrapper.innerHTML = '';

  const curSymbol = activeRestaurant?.currency || '₹';

  if (cart.length === 0) {
    cartItemsWrapper.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center">Cart is empty. Select items to add.</p>';
    populateDiscountItemSelect();
    calculateCheckoutTotal();
    return;
  }

  cart.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item-row animate-slide-up';
    
    // Display item modifiers if they exist
    const modifiersHtml = item.selected_modifiers && item.selected_modifiers.length > 0 ? `
      <div class="cart-item-modifiers" style="font-size: 10px; color: var(--text-muted); margin-top: 2px; padding-left: 6px;">
        ${item.selected_modifiers.map(m => `• ${m.groupName}: ${m.name}`).join('<br>')}
      </div>
    ` : '';

    div.innerHTML = `
      <div style="flex: 1;">
        <h5 style="font-size: 13px; font-weight: 700; color: #fff;">${item.name}</h5>
        <span style="font-size: 11px; color: var(--text-muted);">${formatPrice(item.price, curSymbol)} each</span>
        ${modifiersHtml}
        ${item.special_instruction ? `<p style="font-size: 10px; color: var(--primary-hover); font-style: italic; margin-top: 2px;">Note: ${item.special_instruction}</p>` : ''}
      </div>
      <div class="cart-item-qty-selector">
        <button class="cart-item-qty-btn btn-qty-dec" data-id="${item.item_id}">-</button>
        <span style="font-weight: 750; color: #fff;">${item.quantity}</span>
        <button class="cart-item-qty-btn btn-qty-inc" data-id="${item.item_id}">+</button>
      </div>
      <div style="width: 80px; text-align: right; font-size: 13px; font-weight: 700; color: #fff;">
        ${formatPrice(item.price * item.quantity, curSymbol)}
      </div>
    `;

    div.querySelector('.btn-qty-dec').addEventListener('click', () => updateCartItemQuantity(item.item_id, -1));
    div.querySelector('.btn-qty-inc').addEventListener('click', () => updateCartItemQuantity(item.item_id, 1));

    cartItemsWrapper.appendChild(div);
  });

  populateDiscountItemSelect();
  calculateCheckoutTotal();
};

const calculateCheckoutTotal = () => {
  const curSymbol = activeRestaurant?.currency || '₹';
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  
  // Calculate discount based on type
  if (discountType === 'none') {
    discountAmount = 0;
  } else if (discountType === 'flat') {
    discountAmount = Math.min(subtotal, discountValue);
  } else if (discountType === 'percent') {
    discountAmount = Math.min(subtotal, (discountValue / 100) * subtotal);
  } else if (discountType === 'item') {
    const row = cart.find(i => i.item_id === discountItemId);
    if (row) {
      const itemSubtotal = row.price * row.quantity;
      discountAmount = Math.min(itemSubtotal, (discountValue / 100) * itemSubtotal);
    } else {
      discountAmount = 0;
    }
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const cgst = taxableAmount * 0.025; // 2.5% CGST
  const sgst = taxableAmount * 0.025; // 2.5% SGST
  const grandTotal = taxableAmount + cgst + sgst;

  if (subtotalSpan) subtotalSpan.innerText = formatPrice(subtotal, curSymbol);
  if (cgstSpan) cgstSpan.innerText = formatPrice(cgst, curSymbol);
  if (sgstSpan) sgstSpan.innerText = formatPrice(sgst, curSymbol);
  if (discountAppliedSpan) discountAppliedSpan.innerText = formatPrice(discountAmount, curSymbol);
  if (grandTotalSpan) grandTotalSpan.innerText = formatPrice(grandTotal, curSymbol);
};

const loadTableCartAndBill = () => {
  if (!selectedTableId) {
    cart = [];
    discountType = 'none';
    discountValue = 0;
    discountItemId = '';
    discountAmount = 0;
    
    [btnDiscountNone, btnDiscountFlat, btnDiscountPercent, btnDiscountItem].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (btnDiscountNone) btnDiscountNone.classList.add('active');
    if (discountInputsContainer) discountInputsContainer.style.display = 'none';
    if (discountValueInput) discountValueInput.value = '';
    if (discountItemSelect) {
      discountItemSelect.style.display = 'none';
      discountItemSelect.value = '';
    }
    
    // Reset customer fields
    if (document.getElementById('order-customer-name')) document.getElementById('order-customer-name').value = '';
    if (document.getElementById('order-customer-mobile')) document.getElementById('order-customer-mobile').value = '';
    if (document.getElementById('order-customer-gstin')) document.getElementById('order-customer-gstin').value = '';
    if (document.getElementById('order-customer-company')) document.getElementById('order-customer-company').value = '';
    
    const detailsFields = document.getElementById('customer-details-fields');
    const chevron = document.getElementById('chevron-customer-details');
    if (detailsFields) detailsFields.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    
    renderCart();
    return;
  }

  // Find all unpaid orders for the selected table (including served)
  const matchingOrders = activeOrders.filter(o => o.table_id === selectedTableId && ['received', 'preparing', 'ready', 'served'].includes(o.status));
  if (matchingOrders.length > 0) {
    const aggregatedItems = [];
    matchingOrders.forEach(o => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(item => {
          const existing = aggregatedItems.find(i => {
            if (i.item_id !== item.item_id) return false;
            const aMods = i.selected_modifiers || [];
            const bMods = item.selected_modifiers || [];
            if (aMods.length !== bMods.length) return false;
            const aStr = aMods.map(m => `${m.groupName}:${m.name}`).sort().join('|');
            const bStr = bMods.map(m => `${m.groupName}:${m.name}`).sort().join('|');
            return aStr === bStr;
          });
          
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            aggregatedItems.push({
              item_id: item.item_id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              selected_modifiers: item.selected_modifiers || null,
              special_instruction: item.special_instruction || null
            });
          }
        });
      }
    });

    cart = aggregatedItems;
    
    // Restore discounts
    const firstOrder = matchingOrders[0];
    discountType = firstOrder.discountType || 'none';
    discountValue = firstOrder.discountValue || 0;
    discountItemId = firstOrder.discountItemId || '';
    discountAmount = firstOrder.discountAmount || 0;

    [btnDiscountNone, btnDiscountFlat, btnDiscountPercent, btnDiscountItem].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (discountType === 'none' && btnDiscountNone) btnDiscountNone.classList.add('active');
    if (discountType === 'flat' && btnDiscountFlat) btnDiscountFlat.classList.add('active');
    if (discountType === 'percent' && btnDiscountPercent) btnDiscountPercent.classList.add('active');
    if (discountType === 'item' && btnDiscountItem) btnDiscountItem.classList.add('active');
    
    if (discountType === 'none') {
      if (discountInputsContainer) discountInputsContainer.style.display = 'none';
    } else {
      if (discountInputsContainer) discountInputsContainer.style.display = 'flex';
      if (discountType === 'item') {
        if (discountItemSelect) {
          discountItemSelect.style.display = 'block';
        }
      } else {
        if (discountItemSelect) discountItemSelect.style.display = 'none';
      }
    }
    if (discountValueInput) discountValueInput.value = discountValue || '';

    // Populate customer fields from the first matching order
    if (document.getElementById('order-customer-name')) document.getElementById('order-customer-name').value = firstOrder.customer_name || 'Guest';
    if (document.getElementById('order-customer-mobile')) document.getElementById('order-customer-mobile').value = firstOrder.customer_mobile || '';
    if (document.getElementById('order-customer-gstin')) document.getElementById('order-customer-gstin').value = firstOrder.customer_gstin || '';
    if (document.getElementById('order-customer-company')) document.getElementById('order-customer-company').value = firstOrder.customer_company || '';
    
    // Auto-expand fields if we have any customer info
    const detailsFields = document.getElementById('customer-details-fields');
    const chevron = document.getElementById('chevron-customer-details');
    if (detailsFields) {
      const hasInfo = firstOrder.customer_name || firstOrder.customer_mobile || firstOrder.customer_gstin || firstOrder.customer_company;
      detailsFields.style.display = hasInfo ? 'flex' : 'none';
      if (chevron) chevron.style.transform = hasInfo ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  } else {
    cart = [];
    discountType = 'none';
    discountValue = 0;
    discountItemId = '';
    discountAmount = 0;
    
    [btnDiscountNone, btnDiscountFlat, btnDiscountPercent, btnDiscountItem].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (btnDiscountNone) btnDiscountNone.classList.add('active');
    if (discountInputsContainer) discountInputsContainer.style.display = 'none';
    if (discountValueInput) discountValueInput.value = '';
    if (discountItemSelect) {
      discountItemSelect.style.display = 'none';
      discountItemSelect.value = '';
    }

    // Reset customer fields
    if (document.getElementById('order-customer-name')) document.getElementById('order-customer-name').value = '';
    if (document.getElementById('order-customer-mobile')) document.getElementById('order-customer-mobile').value = '';
    if (document.getElementById('order-customer-gstin')) document.getElementById('order-customer-gstin').value = '';
    if (document.getElementById('order-customer-company')) document.getElementById('order-customer-company').value = '';
    
    const detailsFields = document.getElementById('customer-details-fields');
    const chevron = document.getElementById('chevron-customer-details');
    if (detailsFields) detailsFields.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
  renderCart();
  
  // Explicitly restore selected item inside discount selector after select list populates
  if (discountType === 'item' && discountItemSelect) {
    discountItemSelect.value = discountItemId || '';
  }
};

// Handle "Hold Order" / "Send to Kitchen" form submit
const handleSendKdsOrder = async () => {
  if (!selectedTableId) {
    alert('Please choose a table before sending the order.');
    return;
  }
  if (cart.length === 0) {
    alert('The order cart is empty.');
    return;
  }

  const table = tablesList.find(t => t.id === selectedTableId);
  const tableName = table ? table.table_number : 'Takeaway';

  const customerName = document.getElementById('order-customer-name')?.value.trim() || 'Guest';
  const customerMobile = document.getElementById('order-customer-mobile')?.value.trim() || '';
  const customerGstin = document.getElementById('order-customer-gstin')?.value.trim().toUpperCase() || '';
  const customerCompany = document.getElementById('order-customer-company')?.value.trim() || '';

  const payload = {
    table_id: selectedTableId,
    table_number: tableName,
    customer_name: customerName,
    customer_mobile: customerMobile,
    customer_gstin: customerGstin,
    customer_company: customerCompany,
    status: 'received',
    items: cart,
    discount: discountAmount,
    discountType: discountType,
    discountValue: discountValue,
    discountItemId: discountItemId,
    discountAmount: discountAmount,
    appliedBy: activeUser ? activeUser.role || 'cashier' : 'cashier',
    created_at: new Date()
  };

  btnSendKds.disabled = true;

  try {
    const existingOrder = activeOrders.find(o => o.table_id === selectedTableId && ['received', 'preparing', 'ready'].includes(o.status));
    if (existingOrder) {
      const { doc, updateDoc, db } = await import('./firebase-config.js');
      await updateDoc(doc(db, 'orders', existingOrder.id), {
        items: cart,
        discount: discountAmount,
        discountType: discountType,
        discountValue: discountValue,
        discountItemId: discountItemId,
        discountAmount: discountAmount,
        appliedBy: activeUser ? activeUser.role || 'cashier' : 'cashier',
        customer_name: customerName,
        customer_mobile: customerMobile,
        customer_gstin: customerGstin,
        customer_company: customerCompany
      });
    } else {
      await createCustomerOrder(payload);
    }
    alert('Order details pushed to kitchen display (KDS) successfully!');
  } catch (err) {
    alert('Error pushing order details: ' + err.message);
  } finally {
    btnSendKds.disabled = false;
  }
};

// Settle bill and print thermal print preview
const handleSettleAndPrintBill = async () => {
  if (!selectedTableId) {
    alert('Please choose a table to settle payment.');
    return;
  }
  if (cart.length === 0) {
    alert('The order cart is empty.');
    return;
  }

  // Create a local snapshot of cart & discount because the realtime listener
  // will clear the global 'cart' as soon as we update order statuses to 'settled'
  const itemsToPrint = [...cart];
  const finalDiscount = discountAmount;
  const finalDiscountType = discountType;
  const finalDiscountValue = discountValue;
  const finalDiscountItemId = discountItemId;

  btnPayPrint.disabled = true;

  try {
    const table = tablesList.find(t => t.id === selectedTableId);
    const tableName = table ? table.table_number : 'Takeaway';

    let orderToPrint = null;
    const curSymbol = activeRestaurant?.currency || '₹';

    const customerName = document.getElementById('order-customer-name')?.value.trim() || 'Guest';
    const customerMobile = document.getElementById('order-customer-mobile')?.value.trim() || '';
    const customerGstin = document.getElementById('order-customer-gstin')?.value.trim().toUpperCase() || '';
    const customerCompany = document.getElementById('order-customer-company')?.value.trim() || '';

    const matchingOrders = activeOrders.filter(o => o.table_id === selectedTableId && ['received', 'preparing', 'ready', 'served'].includes(o.status));

    if (matchingOrders.length > 0) {
      // Settle all active/unpaid orders of this table by setting their status to 'settled'
      const { doc, updateDoc, db } = await import('./firebase-config.js');
      for (const ord of matchingOrders) {
        await updateDoc(doc(db, 'orders', ord.id), {
          status: 'settled',
          discount: finalDiscount,
          discountType: finalDiscountType,
          discountValue: finalDiscountValue,
          discountItemId: finalDiscountItemId,
          discountAmount: finalDiscount,
          appliedBy: activeUser ? activeUser.role || 'cashier' : 'cashier',
          customer_name: customerName,
          customer_mobile: customerMobile,
          customer_gstin: customerGstin,
          customer_company: customerCompany
        });
      }
      // Explicitly free the table status
      await updateTableStatus(selectedTableId, 'free');

      const firstOrder = matchingOrders[0];

      orderToPrint = {
        id: firstOrder.id,
        table_number: tableName,
        customer_name: customerName,
        customer_mobile: customerMobile,
        customer_gstin: customerGstin,
        customer_company: customerCompany,
        status: 'settled',
        items: itemsToPrint,
        discount: finalDiscount,
        discountType: finalDiscountType,
        discountValue: finalDiscountValue,
        discountItemId: finalDiscountItemId,
        discountAmount: finalDiscount,
        appliedBy: activeUser ? activeUser.role || 'cashier' : 'cashier',
        created_at: firstOrder.created_at || new Date()
      };
    } else {
      // Cash checkout directly (POS order without QR scan)
      const payload = {
        table_id: selectedTableId,
        table_number: tableName,
        customer_name: customerName,
        customer_mobile: customerMobile,
        customer_gstin: customerGstin,
        customer_company: customerCompany,
        status: 'settled',
        items: itemsToPrint,
        discount: finalDiscount,
        discountType: finalDiscountType,
        discountValue: finalDiscountValue,
        discountItemId: finalDiscountItemId,
        discountAmount: finalDiscount,
        appliedBy: activeUser ? activeUser.role || 'cashier' : 'cashier',
        created_at: new Date()
      };
      const orderId = await createCustomerOrder(payload);
      orderToPrint = { id: orderId, ...payload };
      await updateTableStatus(selectedTableId, 'free');
    }

    // Print Receipt
    printReceipt(orderToPrint, activeRestaurant, curSymbol);

    // Reset checkout state
    selectedTableId = '';
    if (tableSelect) tableSelect.value = '';
    cart = [];
    discountType = 'none';
    discountValue = 0;
    discountItemId = '';
    discountAmount = 0;
    
    [btnDiscountNone, btnDiscountFlat, btnDiscountPercent, btnDiscountItem].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (btnDiscountNone) btnDiscountNone.classList.add('active');
    if (discountInputsContainer) discountInputsContainer.style.display = 'none';
    if (discountValueInput) discountValueInput.value = '';
    if (discountItemSelect) {
      discountItemSelect.style.display = 'none';
      discountItemSelect.value = '';
    }
    
    // Reset customer fields
    if (document.getElementById('order-customer-name')) document.getElementById('order-customer-name').value = '';
    if (document.getElementById('order-customer-mobile')) document.getElementById('order-customer-mobile').value = '';
    if (document.getElementById('order-customer-gstin')) document.getElementById('order-customer-gstin').value = '';
    if (document.getElementById('order-customer-company')) document.getElementById('order-customer-company').value = '';
    
    // Reset collapsible state
    const detailsFields = document.getElementById('customer-details-fields');
    const chevron = document.getElementById('chevron-customer-details');
    if (detailsFields) detailsFields.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    
    renderCart();
    
    alert('Billing checkout finished! Thermal ticket printed.');
  } catch (err) {
    alert('Error completing checkout: ' + err.message);
  } finally {
    btnPayPrint.disabled = false;
  }
};

// Start
window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('order', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initOrderPage();
  });
});

window.addEventListener('beforeunload', () => {
  if (tablesUnsubscribe) tablesUnsubscribe();
  if (categoriesUnsubscribe) categoriesUnsubscribe();
  if (itemsUnsubscribe) itemsUnsubscribe();
  if (ordersUnsubscribe) ordersUnsubscribe();
});
