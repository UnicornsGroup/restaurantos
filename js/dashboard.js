// Dashboard analytics controller for dashboard.html protected panel
import { initAuthGuard } from './auth.js';
import { subscribeTables, subscribeAllOrders } from './realtime.js';
import { formatPrice } from './utils.js';

let activeUser = null;
let activeRestaurant = null;

let tablesList = [];
let ordersList = [];
let salesChart = null;

// DOM references
const salesKPI = document.getElementById('metric-sales');
const tablesKPI = document.getElementById('metric-tables');
const ordersKPI = document.getElementById('metric-orders');
const kdsKPI = document.getElementById('metric-kds');
const transactionsBody = document.getElementById('recent-orders-list');
const chartCanvas = document.getElementById('sales-chart');

const initDashboard = () => {
  // Listen to seating layouts
  subscribeTables((tables) => {
    tablesList = tables;
    updateKPIs();
  });

  // Listen to all historical orders
  subscribeAllOrders((orders) => {
    ordersList = orders;
    updateKPIs();
    renderTransactionsTable();
    renderSalesGraph();
  }, (err) => {
    console.error("Dashboard orders sync failed:", err);
  });
};

const updateKPIs = () => {
  const curSymbol = activeRestaurant?.currency || '₹';
  
  // 1. Calculate today's date range
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const todayOrders = ordersList.filter(order => {
    const createdDate = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
    return createdDate.getTime() >= today.getTime();
  });

  // 2. Sum sales today (only completed 'served'/'settled' bills)
  const todaySales = todayOrders
    .filter(order => ['served', 'settled'].includes(order.status))
    .reduce((acc, order) => {
      const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.05;
      const discount = order.discount || 0;
      return acc + (subtotal + tax - discount);
    }, 0);

  // 3. Count occupied tables
  const occupiedCount = tablesList.filter(t => t.status === 'occupied').length;

  // 4. Count active kitchen cards
  const activeKdsCount = ordersList.filter(o => ['received', 'preparing', 'ready'].includes(o.status)).length;

  // Render text counts
  if (salesKPI) salesKPI.innerText = formatPrice(todaySales, curSymbol);
  if (tablesKPI) tablesKPI.innerText = `${occupiedCount}/${tablesList.length}`;
  if (ordersKPI) ordersKPI.innerText = todayOrders.length;
  if (kdsKPI) kdsKPI.innerText = activeKdsCount;
};

const renderTransactionsTable = () => {
  if (!transactionsBody) return;
  transactionsBody.innerHTML = '';

  const curSymbol = activeRestaurant?.currency || '₹';

  // Sort and grab top 8 recent orders
  const sorted = [...ordersList].sort((a, b) => {
    const timeA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
    const timeB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
    return timeB - timeA;
  }).slice(0, 8);

  if (sorted.length === 0) {
    transactionsBody.innerHTML = '<tr><td colspan="4" class="text-xs text-slate-500 py-6 text-center">No transactions completed yet.</td></tr>';
    return;
  }

  sorted.forEach(order => {
    // Math sum
    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.05;
    const discount = order.discount || 0;
    const total = subtotal + tax - discount;

    const dateStr = order.created_at?.toDate ? order.created_at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid hsla(217, 30%, 18%, 0.4)';
    tr.innerHTML = `
      <td style="padding: 12px; font-weight: 600;">#${order.id.slice(0, 6).toUpperCase()}</td>
      <td style="padding: 12px; color: var(--text-muted);">${order.table_number || 'Takeaway'}</td>
      <td style="padding: 12px; color: var(--text-muted);">${dateStr}</td>
      <td style="padding: 12px; font-weight: 700; text-align: right;">${formatPrice(total, curSymbol)}</td>
      <td style="padding: 12px; text-align: right;">
        <span class="badge ${['served', 'settled'].includes(order.status) ? 'badge-success' : 'badge-warning'}">${order.status}</span>
      </td>
    `;
    transactionsBody.appendChild(tr);
  });
};

const renderSalesGraph = () => {
  if (!chartCanvas || !window.Chart) return;

  // Destroy previous graph inst
  if (salesChart) {
    salesChart.destroy();
  }

  // Calculate last 7 days names & dates
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const labels = [];
  const salesData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    labels.push(daysOfWeek[d.getDay()]);

    // Calculate sales on this specific day
    const nextDay = new Date(d.getTime() + 86400000);
    const dayOrders = ordersList.filter(order => {
      const createdDate = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
      return createdDate.getTime() >= d.getTime() && createdDate.getTime() < nextDay.getTime() && ['served', 'settled'].includes(order.status);
    });

    const daySum = dayOrders.reduce((acc, order) => {
      const sub = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      return acc + (sub + (sub * 0.05) - (order.discount || 0));
    }, 0);

    salesData.push(daySum);
  }

  // Draw chart
  const ctx = chartCanvas.getContext('2d');
  salesChart = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales Vol',
        data: salesData,
        backgroundColor: 'rgba(124, 58, 237, 0.65)',
        borderColor: 'rgba(124, 58, 237, 1)',
        borderWidth: 1.5,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'Outfit' } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { family: 'Outfit' } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
};

window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('dashboard', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initDashboard();
  });
});
