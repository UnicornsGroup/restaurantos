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

// Local state
let selectedTableId = '';
let cart = [];
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
const taxSpan = document.getElementById('checkout-tax');
const discountInput = document.getElementById('cart-discount');
const grandTotalSpan = document.getElementById('checkout-grand-total');

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

  if (discountInput) discountInput.addEventListener('input', (e) => {
    discountAmount = parseFloat(e.target.value) || 0;
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
  subscribeTables((tables) => {
    tablesList = tables.sort((a, b) => String(a.table_number || '').localeCompare(String(b.table_number || '')));
    populateTablesDropdown();
  });

  subscribeCategories((categories) => {
    categoriesList = categories.sort((a, b) => a.display_order - b.display_order);
    renderCategoryTabs();
  });

  subscribeItems((items) => {
    menuItems = items.filter(item => item.is_available === true);
    renderCatalog();
  });

  subscribeAllOrders((orders) => {
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

const renderCart = () => {
  if (!cartItemsWrapper) return;
  cartItemsWrapper.innerHTML = '';

  const curSymbol = activeRestaurant?.currency || '₹';

  if (cart.length === 0) {
    cartItemsWrapper.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center">Cart is empty. Select items to add.</p>';
    calculateCheckoutTotal();
    return;
  }

  cart.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cart-item-row animate-slide-up';
    div.innerHTML = `
      <div style="flex: 1;">
        <h5 style="font-size: 13px; font-weight: 700; color: #fff;">${item.name}</h5>
        <span style="font-size: 11px; color: var(--text-muted);">${formatPrice(item.price, curSymbol)} each</span>
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

  calculateCheckoutTotal();
};

const calculateCheckoutTotal = () => {
  const curSymbol = activeRestaurant?.currency || '₹';
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const tax = subtotal * 0.05; // 5% GST
  const grandTotal = Math.max(0, subtotal + tax - discountAmount);

  if (subtotalSpan) subtotalSpan.innerText = formatPrice(subtotal, curSymbol);
  if (taxSpan) taxSpan.innerText = formatPrice(tax, curSymbol);
  if (grandTotalSpan) grandTotalSpan.innerText = formatPrice(grandTotal, curSymbol);
};

// Check if selected table has active orders on KDS and load them
const loadTableCartAndBill = () => {
  if (!selectedTableId) {
    cart = [];
    discountAmount = 0;
    if (discountInput) discountInput.value = '';
    
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
          const existing = aggregatedItems.find(i => i.item_id === item.item_id);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            aggregatedItems.push({
              item_id: item.item_id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              special_instruction: item.special_instruction || null
            });
          }
        });
      }
    });

    cart = aggregatedItems;
    discountAmount = matchingOrders.reduce((sum, o) => sum + (o.discount || 0), 0);
    if (discountInput) discountInput.value = discountAmount || '';

    // Populate customer fields from the first matching order
    const firstOrder = matchingOrders[0];
    if (document.getElementById('order-customer-name')) document.getElementById('order-customer-name').value = firstOrder.customer_name || 'Guest';
    if (document.getElementById('order-customer-mobile')) document.getElementById('order-customer-mobile').value = firstOrder.customer_mobile || '';
    if (document.getElementById('order-customer-gstin')) document.getElementById('order-customer-gstin').value = firstOrder.customer_gstin || '';
    if (document.getElementById('order-customer-company')) document.getElementById('order-customer-company').value = firstOrder.customer_company || '';
    
    // Auto-expand fields if we have any customer info (e.g. registered customer name/mobile, or B2B details)
    const detailsFields = document.getElementById('customer-details-fields');
    const chevron = document.getElementById('chevron-customer-details');
    if (detailsFields) {
      const hasInfo = firstOrder.customer_name || firstOrder.customer_mobile || firstOrder.customer_gstin || firstOrder.customer_company;
      detailsFields.style.display = hasInfo ? 'flex' : 'none';
      if (chevron) chevron.style.transform = hasInfo ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  } else {
    cart = [];
    discountAmount = 0;
    if (discountInput) discountInput.value = '';

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
    created_at: new Date()
  };

  btnSendKds.disabled = true;

  try {
    const existingOrder = activeOrders.find(o => o.table_id === selectedTableId && ['received', 'preparing', 'ready'].includes(o.status));
    if (existingOrder) {
      // Update existing order payload
      const { doc, updateDoc, db } = await import('./firebase-config.js');
      await updateDoc(doc(db, 'orders', existingOrder.id), {
        items: cart,
        discount: discountAmount,
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
    discountAmount = 0;
    if (discountInput) discountInput.value = '';
    
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
