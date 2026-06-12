// Kitchen Display System (KDS) controller for kitchen.html protected panel
import { initAuthGuard } from './auth.js';
import { updateOrderStatus } from './db.js';
import { subscribeKdsOrders } from './realtime.js';
import { db, collection, query, where, getDocs } from './firebase-config.js';
import { restaurantConfig } from './config.js';

let activeUser = null;
let activeRestaurant = null;
let activeOrdersList = [];
let kdsTimerInterval = null;
let kdsUnsubscribe = null;

// DOM references
const kdsGrid = document.getElementById('kds-grid');

// Send a OneSignal push notification to all waiters assigned to this table
const triggerWaiterNotification = async (orderId, tableId, tableNumber) => {
  if (!tableId) return;

  // 1. Resolve configuration keys
  let appId = restaurantConfig.onesignalAppId || '';
  let restApiKey = restaurantConfig.onesignalRestApiKey || '';

  const cachedSettings = localStorage.getItem('settings_restaurant');
  if (cachedSettings) {
    try {
      const settings = JSON.parse(cachedSettings);
      if (settings.onesignalAppId) appId = settings.onesignalAppId;
      if (settings.onesignalRestApiKey) restApiKey = settings.onesignalRestApiKey;
    } catch (e) {}
  }

  if (activeRestaurant) {
    if (activeRestaurant.onesignalAppId) appId = activeRestaurant.onesignalAppId;
    if (activeRestaurant.onesignalRestApiKey) restApiKey = activeRestaurant.onesignalRestApiKey;
  }

  if (!appId || !restApiKey) {
    console.log("OneSignal push configuration missing. Skipping waiter push notification.");
    return;
  }

  try {
    // 2. Query waiters assigned to this table
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'waiter'),
      where('assigned_tables', 'array-contains', tableId)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      console.log(`No waiters assigned to table ID: ${tableId}`);
      return;
    }

    // 3. Build target tag filters (matching any of the assigned waiters)
    const filters = [];
    snap.forEach((doc, idx) => {
      if (idx > 0) {
        filters.push({ operator: "OR" });
      }
      filters.push({ field: "tag", key: "waiterId", relation: "=", value: doc.id });
    });

    const restaurantName = activeRestaurant?.name || restaurantConfig.name || "DiningOS";

    // 4. Dispatch notification payload to OneSignal
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${restApiKey}`
      },
      body: JSON.stringify({
        app_id: appId,
        headings: { en: `${restaurantName} — Order Ready` },
        contents: { en: `${tableNumber || 'Table'}: Order #${orderId.slice(0, 8).toUpperCase()} is ready to serve!` },
        filters: filters,
        url: `${window.location.origin}${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/tables.html`
      })
    });

    const result = await response.json();
    console.log("OneSignal push notification response:", result);
  } catch (err) {
    console.error("Failed to trigger waiter push notification:", err);
  }
};

const initKitchenPage = () => {
  // Subscribe to live incoming orders
  if (kdsUnsubscribe) kdsUnsubscribe();
  kdsUnsubscribe = subscribeKdsOrders((orders) => {
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
          ${i.selected_modifiers && i.selected_modifiers.length > 0 ? `
            <div class="kds-item-modifiers" style="font-size: 10px; color: var(--text-muted); margin-top: 2px; padding-left: 6px; line-height: 1.3;">
              ${i.selected_modifiers.map(m => `• ${m.groupName}: ${m.name}`).join('<br>')}
            </div>
          ` : ''}
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

    // Touch Swipe gestures (Swipe Right = Advance, Swipe Left = Revert)
    let touchStartX = 0;
    let touchStartY = 0;
    ticket.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    ticket.addEventListener('touchend', async (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      
      // Minimum distance check: 80px horizontal, less than 50px vertical deviation
      if (Math.abs(diffX) > 80 && Math.abs(diffY) < 50) {
        let nextStatus = null;
        if (diffX > 0) {
          // Swipe Right: Advance status
          if (order.status === 'received') nextStatus = 'preparing';
          else if (order.status === 'preparing') nextStatus = 'ready';
          else if (order.status === 'ready') nextStatus = 'served';
        } else {
          // Swipe Left: Revert status
          if (order.status === 'preparing') nextStatus = 'received';
          else if (order.status === 'ready') nextStatus = 'preparing';
        }
        
        if (nextStatus) {
          ticket.style.transform = `translateX(${diffX > 0 ? '120px' : '-120px'})`;
          ticket.style.opacity = '0';
          try {
            await updateOrderStatus(order.id, nextStatus, order.table_id || null);
            if (nextStatus === 'ready') {
              triggerWaiterNotification(order.id, order.table_id || null, order.table_number || null);
            }
          } catch (err) {
            ticket.style.transform = 'none';
            ticket.style.opacity = '1';
            console.error("Failed to update status via swipe:", err);
          }
        }
      }
    }, { passive: true });

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
        if (nextStatus === 'ready') {
          triggerWaiterNotification(orderId, tableId, order ? order.table_number : null);
        }
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

window.addEventListener('beforeunload', () => {
  if (kdsUnsubscribe) kdsUnsubscribe();
  if (kdsTimerInterval) clearInterval(kdsTimerInterval);
});
