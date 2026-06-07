// Kitchen Display System (KDS) controller for kitchen.html protected panel
import { initAuthGuard } from './auth.js';
import { updateOrderStatus } from './db.js';
import { subscribeKdsOrders } from './realtime.js';

let activeUser = null;
let activeRestaurant = null;
let activeOrdersList = [];
let kdsTimerInterval = null;

// DOM references
const kdsGrid = document.getElementById('kds-grid');

const initKitchenPage = () => {
  // Subscribe to live incoming orders
  subscribeKdsOrders((orders) => {
    activeOrdersList = orders.sort((a, b) => {
      const timeA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
      const timeB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      return timeA - timeB;
    });
    renderKdsTickets();
  }, (err) => {
    console.error("KDS sync failed:", err);
  });

  // Enable live elapsed timer refresh every 30 seconds
  if (kdsTimerInterval) clearInterval(kdsTimerInterval);
  kdsTimerInterval = setInterval(updateKdsElapsedTimeText, 30000);
};

const renderKdsTickets = () => {
  if (!kdsGrid) return;
  kdsGrid.innerHTML = '';

  if (activeOrdersList.length === 0) {
    kdsGrid.innerHTML = '<p class="text-xs text-slate-500 py-12 text-center col-span-full">No active orders in the kitchen preparation queue.</p>';
    return;
  }

  activeOrdersList.forEach(order => {
    const ticket = document.createElement('div');
    ticket.className = `glass-panel kds-ticket animate-slide-up ${order.status}`;
    
    // Calculate elapsed time
    const elapsedText = calculateElapsedTime(order.created_at);

    // Items markup list
    const itemsHtml = order.items.map((i, index) => `
      <div class="kds-item-row" data-order-id="${order.id}" data-item-index="${index}">
        <div>
          <span style="color: #fff;">${i.name}</span>
          ${i.special_instruction ? `<p style="font-size: 10px; color: var(--primary-hover); font-style: italic; margin-top: 2px;">Note: ${i.special_instruction}</p>` : ''}
        </div>
        <span class="kds-item-qty">x${i.quantity}</span>
      </div>
    `).join('');

    // Status visual badges & colors
    let statusColor = 'var(--text-muted)';
    if (order.status === 'preparing') statusColor = 'var(--primary-hover)';
    if (order.status === 'ready') statusColor = 'var(--success)';

    ticket.innerHTML = `
      <div class="kds-ticket-header">
        <div>
          <h4 style="color: #fff; font-size: 16px;">${order.table_number || 'Takeaway'}</h4>
          <span class="kds-ticket-time" data-timestamp="${order.created_at?.toDate ? order.created_at.toDate().getTime() : ''}">#${order.id.slice(0, 8).toUpperCase()} • ${elapsedText}</span>
        </div>
        <span class="badge" style="background: hsla(0, 0%, 100%, 0.05); color: ${statusColor}; border-color: ${statusColor}">${order.status}</span>
      </div>
      <div class="kds-ticket-items">
        ${itemsHtml}
      </div>
      <div class="kds-ticket-footer">
        ${order.status === 'received' ? `
          <button class="btn btn-primary btn-kds-transition" style="flex: 1; padding: 8px 12px; font-size: 12px;" data-id="${order.id}" data-action="preparing">Start Prep</button>
        ` : ''}
        ${order.status === 'preparing' ? `
          <button class="btn btn-primary btn-kds-transition" style="flex: 1; padding: 8px 12px; font-size: 12px; background: var(--success); box-shadow: 0 4px 14px 0 var(--success-glow);" data-id="${order.id}" data-action="ready">Mark Ready</button>
        ` : ''}
        ${order.status === 'ready' ? `
          <button class="btn btn-primary btn-kds-transition" style="flex: 1; padding: 8px 12px; font-size: 12px; background: var(--secondary); box-shadow: none;" data-id="${order.id}" data-action="served">Mark Served</button>
        ` : ''}
        <button class="btn btn-secondary btn-kds-transition" style="padding: 8px 12px; font-size: 12px; border-color: var(--danger-glow); color: var(--danger);" data-id="${order.id}" data-action="cancelled">Cancel</button>
      </div>
    `;

    // Click handler for chefs to mark items as prepared locally
    ticket.querySelectorAll('.kds-item-row').forEach(row => {
      row.addEventListener('click', () => {
        row.classList.toggle('completed');
      });
    });

    kdsGrid.appendChild(ticket);
  });

  // Action listeners for ticket state changes
  kdsGrid.querySelectorAll('.btn-kds-transition').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.id;
      const nextStatus = btn.dataset.action;
      const order = activeOrdersList.find(o => o.id === orderId);
      const tableId = order ? order.table_id : null;

      try {
        await updateOrderStatus(orderId, nextStatus, tableId);
      } catch (err) {
        alert("Failed to update status.");
      }
    });
  });
};

const calculateElapsedTime = (timestamp) => {
  if (!timestamp) return 'Just now';
  const createdDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = new Date().getTime() - createdDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins <= 0) return 'Just now';
  return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
};

const updateKdsElapsedTimeText = () => {
  document.querySelectorAll('.kds-ticket-time').forEach(el => {
    const ts = parseInt(el.dataset.timestamp);
    if (ts) {
      el.innerText = `${el.innerText.split('•')[0]}• ${calculateElapsedTime(ts)}`;
    }
  });
};

window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('kitchen', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initKitchenPage();
  });
});
