// Table Setup and QR manager controller for table-setup.html protected panel
import { initAuthGuard } from './auth.js';
import { addSeatingTable, deleteSeatingTable } from './db.js';
import { subscribeTables } from './realtime.js';
import { toggleModal } from './utils.js';
import { restaurantConfig } from './config.js';

let activeUser = null;
let activeRestaurant = null;
let tablesList = [];

// DOM references
const tableGrid = document.getElementById('table-grid');
const addTableBtn = document.getElementById('add-table-btn');
const tableModal = document.getElementById('table-modal');
const closeTableModal = document.getElementById('close-table-modal');
const tableForm = document.getElementById('table-form');

const qrModal = document.getElementById('qr-modal');
const closeQrModal = document.getElementById('close-qr-modal');
const qrImage = document.getElementById('qr-image');
const qrTableName = document.getElementById('qr-table-name');

const initTableSetupPage = () => {
  // Bind actions
  if (addTableBtn) addTableBtn.addEventListener('click', () => {
    tableForm.reset();
    toggleModal(tableModal, true);
  });
  if (closeTableModal) closeTableModal.addEventListener('click', () => toggleModal(tableModal, false));
  if (closeQrModal) closeQrModal.addEventListener('click', () => toggleModal(qrModal, false));
  
  if (tableForm) tableForm.addEventListener('submit', handleCreateTableSubmit);

  // Subscribe to realtime tables list
  subscribeTables((tables) => {
    tablesList = tables.sort((a, b) => a.table_number.localeCompare(b.table_number));
    renderTables();
  }, (err) => {
    console.error("Tables sync failed:", err);
  });
};

const renderTables = () => {
  if (!tableGrid) return;
  tableGrid.innerHTML = '';

  if (tablesList.length === 0) {
    tableGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No seating maps configured yet. Click Add Seating above.</p>';
    return;
  }

  tablesList.forEach(table => {
    const card = document.createElement('div');
    card.className = `glass-panel table-card animate-slide-up ${table.status || 'free'}`;
    card.innerHTML = `
      <div class="table-card-header">
        <span class="table-card-number">${table.table_number}</span>
        <span class="badge ${table.status === 'occupied' ? 'badge-danger' : 'badge-success'}">${table.status || 'free'}</span>
      </div>
      <div class="table-card-body">
        <i data-lucide="users" style="width: 14px; height: 14px; opacity: 0.6;"></i>
        <span>Seats up to ${table.capacity} guests</span>
      </div>
      <div class="table-card-actions">
        <button class="btn btn-primary btn-view-qr" style="padding: 6px 12px;" data-id="${table.id}" title="Show QR Code">
          <i data-lucide="qr-code" style="width: 16px; height: 16px;"></i>
          <span>View QR</span>
        </button>
        <button class="btn btn-danger btn-delete-table" style="padding: 6px 12px;" data-id="${table.id}" title="Delete Table">
          <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
        </button>
      </div>
    `;
    tableGrid.appendChild(card);
  });

  // Bind dynamic card actions
  tableGrid.querySelectorAll('.btn-view-qr').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const table = tablesList.find(t => t.id === btn.dataset.id);
      if (table) {
        qrTableName.innerText = table.table_number;
        qrImage.src = table.qr_code_url;
        toggleModal(qrModal, true);
      }
    });
  });

  tableGrid.querySelectorAll('.btn-delete-table').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Are you sure you want to remove this table configuration and QR link?')) {
        try {
          await deleteSeatingTable(id);
        } catch (err) {
          alert('Failed to delete table config.');
        }
      }
    });
  });

  // Re-run icons loader
  if (window.lucide) window.lucide.createIcons();
};

const handleCreateTableSubmit = async (e) => {
  e.preventDefault();
  const number = document.getElementById('table-number').value.trim();
  const capacity = parseInt(document.getElementById('table-capacity').value);

  try {
    toggleModal(tableModal, false);
    // Use qrBaseUrl from config.js if set, otherwise fall back to current origin
    const hostOrigin = restaurantConfig.qrBaseUrl || window.location.origin;
    await addSeatingTable(number, capacity, hostOrigin);
  } catch (err) {
    console.error("Failed to create table config:", err);
    alert("Error creating table: " + err.message);
  }
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
  initAuthGuard('table-setup', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initTableSetupPage();
  });
});
