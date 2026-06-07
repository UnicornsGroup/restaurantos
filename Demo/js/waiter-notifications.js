// Waiter real-time notification alert module for RestaurantOS
import { db, collection, query, where, onSnapshot } from './firebase-config.js';

let notifiedOrders = new Set();
let isFirstLoad = true;
let unsubscribeListener = null;

// Play a high-quality warning/notification bell sound
const playChime = () => {
  try {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
    audio.volume = 0.45;
    audio.play();
  } catch (e) {
    console.warn("Could not play notification audio:", e);
  }
};

// Show a custom floating toast notification block
const showNotificationToast = (message) => {
  const container = document.getElementById('waiter-toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = 'glass-panel animate-slide-up';
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    background: hsla(222, 47%, 6%, 0.95);
    border: 1px solid var(--border-color);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 16px;
    border-radius: 12px;
    color: #fff;
    font-family: var(--font-sans);
    font-size: 13px;
    pointer-events: auto;
    transition: all 0.3s ease;
    margin-bottom: 8px;
    border-left: 4px solid var(--primary);
  `;
  
  toast.innerHTML = `
    <div style="width: 32px; height: 32px; border-radius: 8px; background: hsla(262, 83%, 58%, 0.15); display: flex; align-items: center; justify-content: center; color: var(--primary-hover); flex-shrink: 0;">
      <i data-lucide="bell" style="width: 16px; height: 16px;"></i>
    </div>
    <div style="flex: 1;">
      <div style="font-weight: 700; color: var(--primary-hover);">Order Ready!</div>
      <div style="color: var(--text-muted); font-size: 12px; margin-top: 2px;">${message}</div>
    </div>
    <button style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" onclick="this.parentElement.remove()">
      <i data-lucide="x" style="width: 16px; height: 16px;"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  if (window.lucide) window.lucide.createIcons();
  
  // Trigger audio alert
  playChime();
  
  // Auto dismiss after 7 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-15px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 7000);
};

const createToastContainer = () => {
  const container = document.createElement('div');
  container.id = 'waiter-toast-container';
  container.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    max-width: 380px;
    width: calc(100% - 48px);
    pointer-events: none;
  `;
  document.body.appendChild(container);
  return container;
};

// Initialize the real-time active order ready subscription
export const initWaiterNotifications = (currentUser) => {
  // Guard clause if user doesn't exist or is not a waiter
  if (!currentUser || currentUser.role !== 'waiter') return;
  
  // Stop existing subscription if any
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }
  
  const assigned = currentUser.assigned_tables;
  if (!Array.isArray(assigned) || assigned.length === 0) {
    console.log("No assigned tables for waiter notification subscription.");
    return;
  }

  notifiedOrders.clear();
  isFirstLoad = true;

  // Query orders with status 'ready' that match waiter's assigned tables
  const q = query(
    collection(db, 'orders'),
    where('status', '==', 'ready'),
    where('table_id', 'in', assigned)
  );

  unsubscribeListener = onSnapshot(q, (snapshot) => {
    const currentReadyIds = [];
    
    snapshot.forEach((doc) => {
      const orderId = doc.id;
      const order = doc.data();
      currentReadyIds.push(orderId);
      
      // If order is not in our notified list and it's not first-time load, alert the waiter
      if (!notifiedOrders.has(orderId) && !isFirstLoad) {
        showNotificationToast(`Order for ${order.table_number || 'Table'} is ready to serve!`);
      }
      notifiedOrders.add(orderId);
    });
    
    // Clean up notified orders list of orders that are no longer status: 'ready' (e.g. served)
    notifiedOrders.forEach((id) => {
      if (!currentReadyIds.includes(id)) {
        notifiedOrders.delete(id);
      }
    });

    isFirstLoad = false;
  }, (err) => {
    console.error("Waiter notifications subscription error:", err);
  });
};
