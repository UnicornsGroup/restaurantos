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

const handleGstExport = (e) => {
  e.preventDefault();

  const startVal = document.getElementById('gst-start-date')?.value;
  const endVal = document.getElementById('gst-end-date')?.value;
  if (!startVal || !endVal) {
    alert("Please select both start and end dates.");
    return;
  }

  const startDate = new Date(startVal + 'T00:00:00');
  const endDate = new Date(endVal + 'T23:59:59');

  const targetOrders = ordersList.filter(order => {
    if (!['served', 'settled'].includes(order.status)) return false;
    const createdDate = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
    const t = createdDate.getTime();
    return t >= startDate.getTime() && t <= endDate.getTime();
  });

  if (targetOrders.length === 0) {
    alert("No completed transactions (served or settled status) found in the selected date range.");
    return;
  }

  const restGstin = activeRestaurant?.gstin || '';
  const restState = activeRestaurant?.stateCode || '27';
  let parsedRestStateCode = restState;
  if (restGstin && restGstin.length >= 2) {
    parsedRestStateCode = restGstin.substring(0, 2);
  }

  const headers = [
    "Invoice No",
    "Invoice Date",
    "Order Type",
    "Customer Name",
    "Company Name",
    "Customer GSTIN",
    "Taxable Value",
    "CGST (2.5%)",
    "SGST (2.5%)",
    "IGST (5.0%)",
    "Total GST",
    "Total Invoice Value",
    "HSN Code"
  ];

  const csvRows = [headers.join(",")];

  targetOrders.forEach(order => {
    // Math splits
    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.05;
    const discount = order.discount || 0;
    const netAmount = subtotal + tax - discount;

    const taxableValue = netAmount / 1.05;
    const netGst = netAmount - taxableValue;

    // Detect interstate splits
    const customerGstin = (order.customer_gstin || '').trim();
    let cgst = 0, sgst = 0, igst = 0;

    if (customerGstin) {
      const customerStateCode = customerGstin.substring(0, 2);
      if (customerStateCode !== parsedRestStateCode) {
        igst = netGst;
      } else {
        cgst = netGst / 2;
        sgst = netGst / 2;
      }
    } else {
      cgst = netGst / 2;
      sgst = netGst / 2;
    }

    // Classify sales channel
    const tblLower = (order.table_number || '').toLowerCase();
    const isEcommerce = tblLower.includes('zomato') || tblLower.includes('swiggy') || tblLower.includes('uber') || tblLower.includes('delivery') || tblLower.includes('online') || tblLower.includes('e-commerce') || tblLower.includes('ecommerce');
    const orderType = isEcommerce ? 'E-commerce Section 9(5)' : 'Direct Dine-in/Takeaway';

    const oDate = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
    const dateFormatted = `${String(oDate.getDate()).padStart(2, '0')}-${String(oDate.getMonth() + 1).padStart(2, '0')}-${oDate.getFullYear()}`;

    const row = [
      `"${order.id.toUpperCase()}"`,
      `"${dateFormatted}"`,
      `"${orderType}"`,
      `"${(order.customer_name || 'Guest').replace(/"/g, '""')}"`,
      `"${(order.customer_company || '').replace(/"/g, '""')}"`,
      `"${customerGstin.replace(/"/g, '""')}"`,
      taxableValue.toFixed(2),
      cgst.toFixed(2),
      sgst.toFixed(2),
      igst.toFixed(2),
      netGst.toFixed(2),
      netAmount.toFixed(2),
      "9963"
    ];
    csvRows.push(row.join(","));
  });

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `GST_Taxation_Report_${startVal}_to_${endVal}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

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

  // Initialize GST report date ranges
  const startInput = document.getElementById('gst-start-date');
  const endInput = document.getElementById('gst-end-date');
  if (startInput && endInput) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const firstDayStr = todayStr.substring(0, 8) + '01';
    startInput.value = firstDayStr;
    endInput.value = todayStr;
  }

  const exportForm = document.getElementById('gst-export-form');
  if (exportForm) {
    exportForm.addEventListener('submit', handleGstExport);
  }
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
