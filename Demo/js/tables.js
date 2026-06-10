// Tables grid controller for tables.html receptionist map panel & waiter hub
import { initAuthGuard } from './auth.js';
import { updateTableStatus, saveGuest } from './db.js';
import { subscribeTables } from './realtime.js';
import { toggleModal } from './utils.js';
import { generateTableQrUrl } from './qr-generator.js';

let activeUser = null;
let activeRestaurant = null;
let tablesList = [];
let tablesUnsubscribe = null;

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
  }, (err) => {
    console.error("Tables sync failed:", err);
  });
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
      card.innerHTML = `
        <div class="table-card-header">
          <span class="table-card-number">${table.table_number}</span>
          <span class="badge ${table.status === 'occupied' ? 'badge-danger' : 'badge-success'}">${table.status || 'free'}</span>
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
});
