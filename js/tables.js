// Tables grid controller for tables.html receptionist map panel
import { initAuthGuard } from './auth.js';
import { updateTableStatus } from './db.js';
import { subscribeTables } from './realtime.js';
import { toggleModal } from './utils.js';
import { generateTableQrUrl } from './qr-generator.js';

let activeUser = null;
let activeRestaurant = null;
let tablesList = [];

// DOM references
const tableGrid = document.getElementById('table-grid');

const qrModal = document.getElementById('qr-modal');
const closeQrModal = document.getElementById('close-qr-modal');
const qrImage = document.getElementById('qr-image');
const qrTableName = document.getElementById('qr-table-name');

const initTablesPage = () => {
  if (closeQrModal) closeQrModal.addEventListener('click', () => toggleModal(qrModal, false));
  
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
    tableGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No seating maps configured yet. Owner can create them under QR Setup.</p>';
    return;
  }

  tablesList.forEach(table => {
    const card = document.createElement('div');
    card.className = `glass-panel table-card animate-slide-up ${table.status || 'free'}`;
    card.style.cursor = 'pointer';
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
    
    // Clicking card toggles status between 'free' and 'occupied'
    card.addEventListener('click', async (e) => {
      // Don't toggle if clicking the QR button
      if (e.target.closest('.btn-view-qr')) return;
      
      const nextStatus = table.status === 'occupied' ? 'free' : 'occupied';
      try {
        await updateTableStatus(table.id, nextStatus);
      } catch (err) {
        console.error("Failed to update table status:", err);
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
        // Always generate fresh QR from current qrBaseUrl in config.js
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
