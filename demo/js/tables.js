// Tables grid controller for tables.html receptionist map panel & waiter hub
import { initAuthGuard } from './auth.js';
import { updateTableStatus, saveGuest } from './db.js';
import { subscribeTables } from './realtime.js';
import { toggleModal } from './utils.js';
import { generateTableQrUrl } from './qr-generator.js';
import { db, collection, query, where, onSnapshot } from './firebase-config.js';

let activeUser = null;
let activeRestaurant = null;
let tablesList = [];
let tablesUnsubscribe = null;
let readyOrdersListGlobal = [];
let readyOrdersUnsubscribe = null;

// DOM references
const tableGrid = document.getElementById('table-grid');

const qrModal = document.getElementById('qr-modal');
const closeQrModal = document.getElementById('close-qr-modal');
const qrImage = document.getElementById('qr-image');
const qrTableName = document.getElementById('qr-table-name');

// Waiter Seating modal references
const waiterSeatingModal = document.getElementById('waiter-seating-modal');
const closeWaiterSeatingModal = document.getElementById('close-waiter-seating-modal');
const waiterSeatingTableName = document.getElementById('waiter-seating-table-name');
const waiterSeatingForm = document.getElementById('waiter-seating-form');
const seatingCustomerName = document.getElementById('seating-customer-name');
const seatingCustomerMobile = document.getElementById('seating-customer-mobile');
const seatingError = document.getElementById('seating-error');

let selectedSeatingTable = null;

const initTablesPage = () => {
  if (closeQrModal) closeQrModal.addEventListener('click', () => toggleModal(qrModal, false));
  
  // Waiter Seating modal binds
  if (closeWaiterSeatingModal) {
    closeWaiterSeatingModal.addEventListener('click', () => toggleModal(waiterSeatingModal, false));
  }
  
  if (waiterSeatingForm) {
    waiterSeatingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedSeatingTable) return;
      
      seatingError.classList.add('hidden');
      const name = seatingCustomerName.value.trim();
      const mobile = seatingCustomerMobile.value.trim();
      
      if (!/^[0-9]{10}$/.test(mobile)) {
        seatingError.innerText = "Please enter a valid 10-digit mobile number.";
        seatingError.classList.remove('hidden');
        return;
      }
      
      const submitBtn = waiterSeatingForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerText = "Seating...";
      
      try {
        // 1. Create/update guest profile
        await saveGuest(mobile, name);
        
        // 2. Set table to occupied with session details
        const { db, doc, updateDoc } = await import('./firebase-config.js');
        await updateDoc(doc(db, 'tables', selectedSeatingTable.id), {
          status: 'occupied',
          current_guest_name: name,
          current_guest_mobile: mobile
        });
        
        toggleModal(waiterSeatingModal, false);
        window.location.href = `customer-menu.html?t=${selectedSeatingTable.id}`;
      } catch (err) {
        console.error("Failed to seat guest:", err);
        seatingError.innerText = err.message || "Failed to start seating.";
        seatingError.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.innerText = "Confirm Details & Take Order";
      }
    });
  }

  // Hide owner actions if user is a waiter
  const addTableBtn = document.getElementById('add-table-btn');
  if (addTableBtn && activeUser?.role === 'waiter') {
    addTableBtn.style.display = 'none';
  }
  
  // Subscribe to realtime tables list
  if (tablesUnsubscribe) tablesUnsubscribe();
  tablesUnsubscribe = subscribeTables((tables) => {
    tablesList = tables.sort((a, b) => String(a.table_number || '').localeCompare(String(b.table_number || '')));
    renderTables();
  });

  // Subscribe to ready orders if user is a waiter
  if (readyOrdersUnsubscribe) readyOrdersUnsubscribe();
  
  const isWaiterUser = activeUser?.role === 'waiter';
  const assignedTables = activeUser?.assigned_tables;
  
  if (isWaiterUser && Array.isArray(assignedTables) && assignedTables.length > 0) {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'ready'),
      where('table_id', 'in', assignedTables)
    );
    
    readyOrdersUnsubscribe = onSnapshot(q, (snapshot) => {
      readyOrdersListGlobal = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderReadyOrders();
      renderTables(); // Re-render to show visual alert badges on table cards
    }, (err) => {
      console.error("Waiter ready orders sync failed:", err);
    });
  } else {
    const section = document.getElementById('ready-orders-section');
    if (section) section.classList.add('hidden');
  }
};

const renderReadyOrders = () => {
  const section = document.getElementById('ready-orders-section');
  const list = document.getElementById('ready-orders-list');
  if (!section || !list) return;

  if (readyOrdersListGlobal.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = '';

  readyOrdersListGlobal.forEach(order => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.cssText = `
      padding: 16px;
      border-left: 4px solid var(--success);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: hsla(142, 70%, 5%, 0.25);
      border-color: hsla(142, 70%, 45%, 0.25);
    `;

    const itemsText = order.items.map(item => `${item.name} (x${item.quantity})`).join(', ');

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div>
          <h4 style="color: #fff; font-size: 15px; font-weight: 700; margin: 0;">${order.table_number || 'Table'}</h4>
          <span style="font-size: 11px; color: var(--text-muted);">#${order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <button class="btn btn-primary btn-serve-order" data-id="${order.id}" data-table-id="${order.table_id || ''}" style="padding: 6px 12px; font-size: 12px; background: var(--success); box-shadow: 0 4px 12px var(--success-glow); display: flex; align-items: center; gap: 4px; border-color: var(--success);">
          <i data-lucide="check" style="width: 14px; height: 14px;"></i>
          <span>Mark Served</span>
        </button>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4; border-top: 1px solid var(--border-color); padding-top: 8px;">
        <strong style="color: #fff;">Items:</strong> ${itemsText}
      </div>
    `;

    // Click handler for serve button
    card.querySelector('.btn-serve-order').addEventListener('click', async (e) => {
      e.stopPropagation();
      const orderId = e.currentTarget.dataset.id;
      const tableId = e.currentTarget.dataset.tableId;
      
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span>Serving...</span>';

      try {
        const { updateOrderStatus } = await import('./db.js');
        await updateOrderStatus(orderId, 'served', tableId);
      } catch (err) {
        console.error("Failed to mark order as served:", err);
        alert("Failed to mark served.");
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i><span>Mark Served</span>';
        if (window.lucide) window.lucide.createIcons();
      }
    });

    list.appendChild(card);
  });

  if (window.lucide) window.lucide.createIcons();
};

const renderTables = () => {
  if (!tableGrid) return;
  tableGrid.innerHTML = '';

  const isWaiter = activeUser?.role === 'waiter';
  const assigned = activeUser?.assigned_tables;
  let filteredTables = tablesList;

  if (isWaiter && Array.isArray(assigned)) {
    filteredTables = tablesList.filter(t => assigned.includes(t.id));
  }

  if (filteredTables.length === 0) {
    if (isWaiter) {
      tableGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No tables assigned to you. Please contact your administrator.</p>';
    } else {
      tableGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No seating maps configured yet. Owner can create them under QR Setup.</p>';
    }
    return;
  }

  filteredTables.forEach(table => {
    const card = document.createElement('div');
    card.className = `glass-panel table-card animate-slide-up ${table.status || 'free'}`;
    card.style.cursor = 'pointer';
    
    if (isWaiter) {
      const hasReadyOrder = readyOrdersListGlobal.some(o => o.table_id === table.id);
      let badgeHtml = `<span class="badge ${table.status === 'occupied' ? 'badge-danger' : 'badge-success'}">${table.status || 'free'}</span>`;
      if (hasReadyOrder) {
        badgeHtml = `<span class="badge" style="background: var(--success); color: #fff; box-shadow: 0 0 10px var(--success-glow); animation: pulse 2s infinite; border-color: var(--success);">Ready to Serve</span>`;
      }

      card.innerHTML = `
        <div class="table-card-header">
          <span class="table-card-number">${table.table_number}</span>
          ${badgeHtml}
        </div>
        <div class="table-card-body">
          <i data-lucide="users" style="width: 14px; height: 14px; opacity: 0.6;"></i>
          <span>Seats up to ${table.capacity} guests</span>
          ${table.status === 'occupied' && table.current_guest_name ? `
            <div style="font-size: 11px; color: var(--primary-hover); margin-top: 6px; font-weight: 600;">
              Active: ${table.current_guest_name}
            </div>
          ` : ''}
        </div>
        <div class="table-card-actions">
          <button class="btn btn-primary btn-take-order" style="padding: 6px 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;" data-id="${table.id}">
            <i data-lucide="shopping-cart" style="width: 16px; height: 16px;"></i>
            <span>${table.status === 'occupied' ? 'Open Order' : 'Take Order'}</span>
          </button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="table-card-header">
          <span class="table-card-number">${table.table_number}</span>
          <span class="badge ${table.status === 'occupied' ? 'badge-danger' : 'badge-success'}" style="cursor: pointer;">${table.status || 'free'}</span>
        </div>
        <div class="table-card-body">
          <i data-lucide="users" style="width: 14px; height: 14px; opacity: 0.6;"></i>
          <span>Seats up to ${table.capacity} guests</span>
        </div>
        <div class="table-card-actions">
          <button class="btn btn-secondary btn-view-qr" style="padding: 6px 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;" data-id="${table.id}" title="Show QR Code">
            <i data-lucide="qr-code" style="width: 16px; height: 16px;"></i>
            <span>View QR Menu</span>
          </button>
        </div>
      `;
    }
    
    // Clicking card triggers role actions
    card.addEventListener('click', async (e) => {
      // Don't toggle if clicking receptionist QR button
      if (e.target.closest('.btn-view-qr')) return;
      
      if (isWaiter) {
        if (table.status === 'occupied') {
          window.location.href = `customer-menu.html?t=${table.id}`;
        } else {
          // Open waiter guest seating details input modal
          selectedSeatingTable = table;
          waiterSeatingTableName.innerText = table.table_number;
          seatingCustomerName.value = '';
          seatingCustomerMobile.value = '';
          seatingError.classList.add('hidden');
          toggleModal(waiterSeatingModal, true);
        }
      } else {
        const nextStatus = table.status === 'occupied' ? 'free' : 'occupied';
        try {
          await updateTableStatus(table.id, nextStatus);
        } catch (err) {
          console.error("Failed to update table status:", err);
        }
      }
    });

    tableGrid.appendChild(card);
  });

  // Bind dynamic card actions
  tableGrid.querySelectorAll('.btn-view-qr').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const table = tablesList.find(t => t.id === btn.dataset.id);
      if (table) {
        qrTableName.innerText = table.table_number;
        qrImage.src = generateTableQrUrl(table.id);
        toggleModal(qrModal, true);
      }
    });
  });

  // Re-run icons loader
  if (window.lucide) window.lucide.createIcons();
};

// Global QR code downloader download handler
window.downloadQrCode = () => {
  const src = qrImage.src;
  if (src) {
    window.open(src, '_blank');
  }
};

// Execute page initialization guarded by route credentials check
window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('tables', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initTablesPage();
  });
});

window.addEventListener('beforeunload', () => {
  if (tablesUnsubscribe) tablesUnsubscribe();
  if (readyOrdersUnsubscribe) readyOrdersUnsubscribe();
});
