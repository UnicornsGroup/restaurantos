// Admin dashboard controller for master console
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

// Master Firebase Configuration
const masterFirebaseConfig = {
  apiKey: "AIzaSyDtkzlk9x4x6VIh2r8ZvkDlfLh8YXLuh8Q",
  authDomain: "diningos-8af28.firebaseapp.com",
  projectId: "diningos-8af28",
  storageBucket: "diningos-8af28.firebasestorage.app",
  messagingSenderId: "428942092219",
  appId: "1:428942092219:web:feec8085060414b1eac69e",
  measurementId: "G-B439F724Q7"
};

let isRealFirebase = false;
let auth = null;
let db = null;

// Try to initialize real Firebase if configuration is provided
if (masterFirebaseConfig.apiKey && masterFirebaseConfig.apiKey !== "") {
  try {
    const app = initializeApp(masterFirebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isRealFirebase = true;
  } catch (err) {
    console.error("Master Firebase init failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST & EMAIL HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const showToast = (message, type = 'success') => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `admin-toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

const showLoadingSpinner = (show) => {
  let spinner = document.getElementById('global-spinner');
  if (!spinner) {
    spinner = document.createElement('div');
    spinner.id = 'global-spinner';
    spinner.className = 'spinner-overlay hidden';
    spinner.innerHTML = `
      <div class="spinner-box">
        <div class="spinner-circle"></div>
        <div style="margin-top: 12px; font-size: 13px; font-weight: 600; color: #8b2323;">Processing...</div>
      </div>
    `;
    document.body.appendChild(spinner);
  }
  if (show) {
    spinner.classList.remove('hidden');
  } else {
    spinner.classList.add('hidden');
  }
};

const handleCall = (e, mobile) => {
  const fullNum = `+91${mobile}`;
  // Copy to clipboard on click
  navigator.clipboard.writeText(fullNum).catch(() => {});
  
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobileDevice) {
    e.preventDefault(); // Stop protocol handler on desktop to show tooltip/toast instead
    showToast(`Copied number: ${fullNum}`, 'success');
  }
};

const getWhatsAppMessage = (r) => {
  const ownerName = r.ownerName || 'Owner';
  const restaurantName = r.name;
  
  // Expiry days left calculation
  const expiry = new Date(r.expiryDate).getTime();
  const diffDays = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, diffDays);
  
  // Grace days left calculation
  let graceDaysLeft = 7;
  if (r.graceStartDate) {
    const graceStart = new Date(r.graceStartDate).getTime();
    const elapsed = Math.floor((Date.now() - graceStart) / (1000 * 60 * 60 * 24));
    graceDaysLeft = Math.max(0, 7 - elapsed);
  }

  if (r.status === 'suspended') {
    return `Hi ${ownerName}! 🔴\nYour DiningOS access for ${restaurantName} has been suspended due to non-renewal.\nYour data is safe for 90 days.\nRenew now to restore access:\nReply here or call us.`;
  } else if (r.status === 'grace') {
    return `Hi ${ownerName}! ⚠️\nYour DiningOS plan for ${restaurantName} has expired.\nYour system still works for ${graceDaysLeft} more days.\nPlease renew immediately to avoid interruption.\nReply here or call us now.`;
  } else if (daysLeft <= 5) {
    return `Hi ${ownerName}! 👋\nYour DiningOS plan for ${restaurantName} expires in ${daysLeft} days.\nRenew now to avoid interruption:\nMonthly   ₹1,999/month\nAnnual    ₹19,999/year (saves ₹3,989)\nLifetime  ₹49,999 one-time\nReply to this message or call us to renew. 😊`;
  } else {
    return `Hi ${ownerName}! 👋\nThis is from DiningOS.\nHow is everything going with ${restaurantName}?\nLet me know if you need any help.\nSupport: +91XXXXXXXXXX`;
  }
};

const getEmailTemplate = (r) => {
  const ownerName = r.ownerName || 'Owner';
  const restaurantName = r.name;
  const expiryDate = r.expiryDate || 'N/A';
  
  const expiry = new Date(r.expiryDate).getTime();
  const diffDays = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, diffDays);

  let graceDaysLeft = 7;
  if (r.graceStartDate) {
    const graceStart = new Date(r.graceStartDate).getTime();
    const elapsed = Math.floor((Date.now() - graceStart) / (1000 * 60 * 60 * 24));
    graceDaysLeft = Math.max(0, 7 - elapsed);
  }

  let subject = '';
  let body = '';

  if (r.status === 'grace' || r.status === 'suspended') {
    subject = "Action needed — DiningOS plan expired";
    body = `Dear ${ownerName},\n\nYour DiningOS plan for ${restaurantName} has expired.\n\nYour system continues to work for ${graceDaysLeft} more days.\n\nPlease renew immediately to avoid losing access.\n\nBest regards,\nDiningOS Support\n+91XXXXXXXXXX`;
  } else if (daysLeft <= 5) {
    subject = `Your DiningOS plan expires in ${daysLeft} days`;
    body = `Dear ${ownerName},\n\nYour DiningOS plan for ${restaurantName} will expire on ${expiryDate}.\n\nRenew now to avoid interruption:\n\nMonthly — ₹1,999/month\nAnnual — ₹19,999/year (saves ₹3,989)\nLifetime — ₹49,999 one-time\n\nReply to this email or WhatsApp us to renew.\n\nBest regards,\nDiningOS Support\n+91XXXXXXXXXX`;
  } else {
    subject = "DiningOS — We're here to help";
    body = `Dear ${ownerName},\n\nHope everything is going well at ${restaurantName}!\n\nWe wanted to check in and see if you need any help with your DiningOS system.\n\nFree feel to reply to this email or WhatsApp us anytime.\n\nBest regards,\nDiningOS Support\n+91XXXXXXXXXX`;
  }

  return { subject, body };
};

const sendEmail = async (ownerEmail, ownerName, restaurantName, subject, body) => {
  try {
    showLoadingSpinner(true);
    
    // We send via EmailJS
    await emailjs.send(
      "service_default",
      "template_default",
      {
        to_email: ownerEmail,
        owner_name: ownerName,
        restaurant_name: restaurantName,
        subject: subject,
        body: body
      },
      "your_public_key"
    );
    
    showToast(`✅ Email sent to ${ownerName}`, 'success');
  } catch (error) {
    console.error("EmailJS send error:", error);
    showToast('❌ Email failed — check config or try again', 'error');
  } finally {
    showLoadingSpinner(false);
  }
};

const calculateSetupFee = (tables) => {
  if (isNaN(tables) || tables <= 0) return { subtotal: 0, gst: 0, total: 0 };
  let subtotal = 0;
  if (tables <= 10) {
    subtotal = 1999;
  } else {
    subtotal = 1999 + ((tables - 10) * 99);
  }
  const gst = subtotal * 0.18;
  const total = subtotal + gst;
  return { subtotal, gst, total };
};

// Local mock database state as fallback
let localRestaurants = [];
const loadLocalDb = () => {
  const data = localStorage.getItem('ros_admin_restaurants');
  if (data) {
    localRestaurants = JSON.parse(data);
  } else {
    // Inject seed data
    localRestaurants = [
      {
        id: 'delight-cafe-1',
        name: 'Delight Cafe & Grill',
        ownerName: 'Sandeep Patel',
        ownerEmail: 'sandeep@delightcafe.com',
        mobile: '9988776655',
        plan: 'monthly',
        setupFee: 1999,
        status: 'active',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        graceStartDate: '',
        notes: 'Requested integration with a custom subdomain.'
      },
      {
        id: 'royal-dine-2',
        name: 'Royal Fine Dine',
        ownerName: 'Amit Sharma',
        ownerEmail: 'amit@royalfinedine.com',
        mobile: '9822334455',
        plan: 'annual',
        setupFee: 2989,
        status: 'active',
        created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() + 265 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        graceStartDate: '',
        notes: 'Annual upfront saver payment verified.'
      },
      {
        id: 'spicy-palace-3',
        name: 'The Spicy Palace',
        ownerName: 'Rajesh Kumar',
        ownerEmail: 'rajesh@spicypalace.com',
        mobile: '9123456780',
        plan: 'trial',
        setupFee: 0,
        status: 'grace',
        created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        graceStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: 'Trial ended. Grace period active for subscription purchase.'
      },
      {
        id: 'punjabi-rasoi-4',
        name: 'Punjabi Rasoi',
        ownerName: 'Harpreet Singh',
        ownerEmail: 'harpreet@punjabirasoi.com',
        mobile: '9009988776',
        plan: 'monthly',
        setupFee: 1999,
        status: 'suspended',
        created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        graceStartDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: 'Grace period expired without billing. SUSPENDED.'
      }
    ];
    saveLocalDb();
  }
};

const saveLocalDb = () => {
  localStorage.setItem('ros_admin_restaurants', JSON.stringify(localRestaurants));
};

// DOM views cache
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminEmail = document.getElementById('admin-email');
const adminPassword = document.getElementById('admin-password');
const logoutBtn = document.getElementById('logout-btn');

const searchRestaurants = document.getElementById('search-restaurants');
const exportCsvBtn = document.getElementById('export-csv-btn');
const addRestaurantForm = document.getElementById('add-restaurant-form');
const editRestForm = document.getElementById('edit-rest-form');

const restaurantsTableBody = document.getElementById('restaurants-table-body');
const alertsTableBody = document.getElementById('alerts-table-body');

const detailModal = document.getElementById('detail-modal');
const closeDetailModal = document.getElementById('close-detail-modal');

// Tab control cache
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Stats metrics references
const mrrVal = document.getElementById('mrr-val');
const totalClientsVal = document.getElementById('total-clients-val');
const graceSuspVal = document.getElementById('grace-susp-val');
const trialsVal = document.getElementById('trials-val');
const arrVal = document.getElementById('arr-val');

let activeTab = 'overview';
let activeSearchQuery = '';
let revenueChart = null;
let selectedRestaurant = null; // Currently viewed restaurant in detail modal

const checkAuth = () => {
  // Check local storage mock session first
  const session = localStorage.getItem('ros_admin_session');
  if (session) {
    showDashboard();
    return;
  }

  if (isRealFirebase) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        showDashboard();
      } else {
        showLogin();
      }
    });
  } else {
    showLogin();
  }
};

const showLogin = () => {
  authView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
};

const showDashboard = () => {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  loadData();
  initRevenueChart();
};

const loadData = () => {
  if (isRealFirebase) {
    onSnapshot(collection(db, 'restaurants'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateRestaurantList(list);
    });
  } else {
    loadLocalDb();
    updateRestaurantList(localRestaurants);
  }
};

const updateRestaurantList = (list) => {
  localRestaurants = list;
  calculateMetrics();
  renderRestaurantsTable();
  renderAlertsTable();
  
  // Keep selectedRestaurant in sync if modal is open
  if (selectedRestaurant) {
    const updated = localRestaurants.find(r => r.id === selectedRestaurant.id);
    if (updated) {
      selectedRestaurant = updated;
    }
  }
};

const calculateMetrics = () => {
  let mrr = 0;
  let total = localRestaurants.length;
  let graceSusp = 0;
  let trials = 0;

  localRestaurants.forEach(r => {
    if (r.status === 'active') {
      if (r.plan === 'monthly') mrr += 1999;
      if (r.plan === 'annual') mrr += Math.round(19999 / 12);
    }
    if (r.status === 'grace' || r.status === 'suspended') {
      graceSusp += 1;
    }
    if (r.plan === 'trial') {
      trials += 1;
    }
  });

  if (mrrVal) mrrVal.innerText = `₹${mrr.toLocaleString('en-IN')}`;
  if (totalClientsVal) totalClientsVal.innerText = total;
  if (graceSuspVal) graceSuspVal.innerText = graceSusp;
  if (trialsVal) trialsVal.innerText = trials;
  if (arrVal) arrVal.innerText = `₹${(mrr * 12).toLocaleString('en-IN')}`;
};

const renderRestaurantsTable = () => {
  if (!restaurantsTableBody) return;
  restaurantsTableBody.innerHTML = '';

  const filtered = localRestaurants.filter(r => {
    const q = activeSearchQuery.toLowerCase();
    return r.name.toLowerCase().includes(q) || 
           r.id.toLowerCase().includes(q) || 
           (r.ownerName && r.ownerName.toLowerCase().includes(q)) || 
           (r.mobile && r.mobile.includes(q));
  });

  if (filtered.length === 0) {
    restaurantsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No restaurants found.</td></tr>';
    return;
  }

  filtered.forEach(r => {
    const tr = document.createElement('tr');
    
    let badgeClass = 'badge-expired';
    if (r.status === 'active') badgeClass = 'badge-active';
    if (r.status === 'grace') badgeClass = 'badge-grace';
    
    const formattedPlan = r.plan ? r.plan.charAt(0).toUpperCase() + r.plan.slice(1) : 'Trial';

    let setupFeeDisplay = '₹0';
    if (r.setupFee) {
      if (typeof r.setupFee === 'object') {
        setupFeeDisplay = `₹${Math.round(r.setupFee.total || 0)}`;
      } else {
        setupFeeDisplay = `₹${r.setupFee}`;
      }
    }

    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-main);">${r.name}</td>
      <td>
        <div style="font-weight: 500;">${r.ownerName || 'Unknown'}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${r.mobile || ''}</div>
      </td>
      <td>
        <div>${formattedPlan}</div>
        <div style="font-size: 11px; color: var(--text-muted);">Setup: ${setupFeeDisplay}</div>
      </td>
      <td style="color: var(--warning);">${r.graceStartDate || 'N/A'}</td>
      <td style="font-weight: 500;">${r.expiryDate || 'N/A'}</td>
      <td><span class="badge ${badgeClass}">${r.status}</span></td>
      <td>
        <div style="display: flex; gap: 6px; align-items: center;">
          <a href="tel:+91${r.mobile}" class="btn btn-secondary btn-call-action" style="padding: 4px 8px; font-size: 11px; height: 32px; text-decoration: none; display: inline-flex; align-items: center;">📞 Call</a>
          <button class="btn btn-secondary btn-wa-action" style="padding: 4px 8px; font-size: 11px; height: 32px; display: inline-flex; align-items: center;">💬 WhatsApp</button>
          <button class="btn btn-secondary btn-email-action" style="padding: 4px 8px; font-size: 11px; height: 32px; display: inline-flex; align-items: center;">✉️ Email</button>
          <button class="btn btn-secondary btn-edit-rest" data-id="${r.id}" style="padding: 4px 10px; font-size: 11px; height: 32px;">View</button>
        </div>
      </td>
    `;
    
    const callLink = tr.querySelector('.btn-call-action');
    callLink.addEventListener('click', (e) => handleCall(e, r.mobile));

    const waBtn = tr.querySelector('.btn-wa-action');
    waBtn.addEventListener('click', () => {
      const msg = getWhatsAppMessage(r);
      window.open(`https://wa.me/91${r.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
    });

    const emailBtn = tr.querySelector('.btn-email-action');
    emailBtn.addEventListener('click', async () => {
      const email = r.ownerEmail || `owner@${r.id}.com`;
      const { subject, body } = getEmailTemplate(r);
      await sendEmail(email, r.ownerName || 'Owner', r.name, subject, body);
    });

    tr.querySelector('.btn-edit-rest').addEventListener('click', () => openEditModal(r));
    restaurantsTableBody.appendChild(tr);
  });
};

const renderAlertsTable = () => {
  if (!alertsTableBody) return;
  alertsTableBody.innerHTML = '';

  const expiringList = localRestaurants.filter(r => {
    // Expired, suspended or grace status
    return r.status === 'grace' || r.status === 'suspended' || (r.expiryDate && (new Date(r.expiryDate).getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000));
  });

  if (expiringList.length === 0) {
    alertsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No active alerts or grace period accounts.</td></tr>';
    return;
  }

  expiringList.forEach(r => {
    const tr = document.createElement('tr');
    
    // Calculate days remaining or overdue
    const expiry = new Date(r.expiryDate).getTime();
    const diffTime = expiry - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let daysLabel = '';
    let daysStyle = '';
    if (diffDays < 0) {
      daysLabel = `${Math.abs(diffDays)} days overdue`;
      daysStyle = 'color: var(--danger); font-weight: 700;';
    } else {
      daysLabel = `${diffDays} days left`;
      daysStyle = 'color: var(--warning); font-weight: 700;';
    }

    let badgeClass = 'badge-expired';
    if (r.status === 'grace') badgeClass = 'badge-grace';
    if (r.status === 'suspended') badgeClass = 'badge-expired';

    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text-main);">${r.name}</td>
      <td style="${daysStyle}">${daysLabel}</td>
      <td>
        <div style="font-size: 11px; margin-bottom: 4px; font-weight: 500;">${r.mobile || ''}</div>
        <div style="display: flex; gap: 4px;">
          <a href="tel:+91${r.mobile}" class="btn btn-secondary btn-call-action" style="padding: 2px 6px; font-size: 10px; height: 26px; text-decoration: none; display: inline-flex; align-items: center;">📞 Call</a>
          <button class="btn btn-secondary btn-wa-action" style="padding: 2px 6px; font-size: 10px; height: 26px; display: inline-flex; align-items: center;">💬 WhatsApp</button>
          <button class="btn btn-secondary btn-email-action" style="padding: 2px 6px; font-size: 10px; height: 26px; display: inline-flex; align-items: center;">✉️ Email</button>
        </div>
      </td>
      <td><span class="badge ${badgeClass}">${r.status}</span></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary extend-trial-btn" data-id="${r.id}" style="padding: 4px 8px; font-size: 11px; height: 26px; border-color: rgba(139,35,35,0.2); color: var(--primary);">+7D Plan</button>
          ${r.status !== 'suspended' ? `
            <button class="btn btn-secondary suspend-btn" data-id="${r.id}" style="padding: 4px 8px; font-size: 11px; height: 26px; border-color: rgba(239,68,68,0.2); color: var(--danger);">Suspend</button>
          ` : `
            <button class="btn btn-secondary reactivate-btn" data-id="${r.id}" style="padding: 4px 8px; font-size: 11px; height: 26px; border-color: rgba(22,163,74,0.2); color: var(--success);">Reactivate</button>
          `}
        </div>
      </td>
    `;
    
    // Bind buttons
    const callLink = tr.querySelector('.btn-call-action');
    callLink.addEventListener('click', (e) => handleCall(e, r.mobile));

    const waBtn = tr.querySelector('.btn-wa-action');
    waBtn.addEventListener('click', () => {
      const msg = getWhatsAppMessage(r);
      window.open(`https://wa.me/91${r.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
    });

    const emailBtn = tr.querySelector('.btn-email-action');
    emailBtn.addEventListener('click', async () => {
      const email = r.ownerEmail || `owner@${r.id}.com`;
      const { subject, body } = getEmailTemplate(r);
      await sendEmail(email, r.ownerName || 'Owner', r.name, subject, body);
    });

    tr.querySelector('.extend-trial-btn').addEventListener('click', () => handleExtendTrial(r.id));
    const suspBtn = tr.querySelector('.suspend-btn');
    if (suspBtn) suspBtn.addEventListener('click', () => handleSuspendToggle(r.id, true));
    const reactBtn = tr.querySelector('.reactivate-btn');
    if (reactBtn) reactBtn.addEventListener('click', () => handleSuspendToggle(r.id, false));

    alertsTableBody.appendChild(tr);
  });
  if (window.lucide) window.lucide.createIcons();
};

const handleExtendTrial = async (restId) => {
  const rest = localRestaurants.find(r => r.id === restId);
  if (!rest) return;
  
  const currentExpiry = rest.expiryDate ? new Date(rest.expiryDate).getTime() : Date.now();
  const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + 7 * 24 * 60 * 60 * 1000);
  const expiryStr = newExpiry.toISOString().split('T')[0];

  if (isRealFirebase) {
    try {
      showLoadingSpinner(true);
      await updateDoc(doc(db, 'restaurants', restId), {
        expiryDate: expiryStr,
        status: 'active',
        graceStartDate: ''
      });
      showToast("DiningOS plan extended by 7 days!", "success");
    } catch (err) {
      showToast("Firebase update failed: " + err.message, "error");
    } finally {
      showLoadingSpinner(false);
    }
  } else {
    rest.expiryDate = expiryStr;
    rest.status = 'active';
    rest.graceStartDate = '';
    saveLocalDb();
    updateRestaurantList(localRestaurants);
    showToast("DiningOS plan extended by 7 days!", "success");
  }
};

const handleSuspendToggle = async (restId, suspend) => {
  const rest = localRestaurants.find(r => r.id === restId);
  if (!rest) return;

  const newStatus = suspend ? 'suspended' : 'active';
  const newExpiry = suspend ? rest.expiryDate : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (isRealFirebase) {
    try {
      showLoadingSpinner(true);
      await updateDoc(doc(db, 'restaurants', restId), {
        status: newStatus,
        expiryDate: newExpiry
      });
      showToast(suspend ? "Account suspended successfully." : "Account reactivated successfully.", "warning");
    } catch (err) {
      showToast("Firebase update failed: " + err.message, "error");
    } finally {
      showLoadingSpinner(false);
    }
  } else {
    rest.status = newStatus;
    rest.expiryDate = newExpiry;
    saveLocalDb();
    updateRestaurantList(localRestaurants);
    showToast(suspend ? "Account suspended successfully." : "Account reactivated successfully.", "warning");
  }
};

const handleRenewRest = async (restId) => {
  const rest = localRestaurants.find(r => r.id === restId);
  if (!rest) return;
  const currentExpiry = rest.expiryDate ? new Date(rest.expiryDate).getTime() : Date.now();
  const newExpiry = new Date(Math.max(Date.now(), currentExpiry) + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  if (isRealFirebase) {
    try {
      showLoadingSpinner(true);
      await updateDoc(doc(db, 'restaurants', restId), {
        plan: 'monthly',
        status: 'active',
        expiryDate: newExpiry,
        graceStartDate: ''
      });
      showToast("Subscription renewed successfully!", "success");
    } catch (err) {
      showToast("Firebase update failed: " + err.message, "error");
    } finally {
      showLoadingSpinner(false);
    }
  } else {
    rest.plan = 'monthly';
    rest.status = 'active';
    rest.expiryDate = newExpiry;
    rest.graceStartDate = '';
    saveLocalDb();
    updateRestaurantList(localRestaurants);
    showToast("Subscription renewed successfully!", "success");
  }
};

const openEditModal = (r) => {
  if (!detailModal) return;
  selectedRestaurant = r;
  
  document.getElementById('edit-id').value = r.id;
  document.getElementById('modal-rest-name').innerText = r.name;
  document.getElementById('modal-rest-id').innerText = `ID: #${r.id}`;
  
  document.getElementById('edit-plan').value = r.plan || 'trial';
  document.getElementById('edit-status').value = r.status || 'active';
  document.getElementById('edit-expiry').value = r.expiryDate || '';
  document.getElementById('edit-grace-start').value = r.graceStartDate || '';
  document.getElementById('edit-notes').value = r.notes || '';
  
  // Set call href
  const modalCallBtn = document.getElementById('modal-call-btn');
  if (modalCallBtn) {
    modalCallBtn.setAttribute('href', `tel:+91${r.mobile}`);
  }

  detailModal.classList.remove('hidden');
  detailModal.classList.add('active');
};

const closeDetailModalView = () => {
  if (!detailModal) return;
  detailModal.classList.remove('active');
  detailModal.classList.add('hidden');
  selectedRestaurant = null;
};

const handleEditSubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const rest = localRestaurants.find(r => r.id === id);
  if (!rest) return;

  const plan = document.getElementById('edit-plan').value;
  const status = document.getElementById('edit-status').value;
  const expiry = document.getElementById('edit-expiry').value;
  const grace = document.getElementById('edit-grace-start').value;
  const notes = document.getElementById('edit-notes').value;

  if (isRealFirebase) {
    try {
      showLoadingSpinner(true);
      await updateDoc(doc(db, 'restaurants', id), {
        plan, status, expiryDate: expiry, graceStartDate: grace, notes
      });
      showToast("Subscription settings saved.", "success");
      closeDetailModalView();
    } catch (err) {
      showToast("Firebase save failed: " + err.message, "error");
    } finally {
      showLoadingSpinner(false);
    }
  } else {
    rest.plan = plan;
    rest.status = status;
    rest.expiryDate = expiry;
    rest.graceStartDate = grace;
    rest.notes = notes;
    saveLocalDb();
    closeDetailModalView();
    updateRestaurantList(localRestaurants);
    showToast("Subscription settings saved in local DB.", "success");
  }
};

const handleAddRestaurantSubmit = async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('new-rest-id').value.trim();
  const name = document.getElementById('new-rest-name').value.trim();
  const owner = document.getElementById('new-rest-owner').value.trim();
  const email = document.getElementById('new-rest-email').value.trim();
  const mobile = document.getElementById('new-rest-mobile').value.trim();
  const plan = document.getElementById('new-rest-plan').value;
  const tablesVal = parseInt(document.getElementById('new-rest-tables').value) || 0;
  const paymentId = document.getElementById('new-rest-payment-id').value.trim();
  const notes = document.getElementById('new-rest-notes').value.trim();

  // Validate ID unique
  if (localRestaurants.some(r => r.id === id)) {
    showToast("Project ID is already onboarded.", "error");
    return;
  }

  // Calculate default expiration date (e.g. +15 days for trial, +30 days for monthly, +365 for annual)
  let days = 15;
  if (plan === 'monthly') days = 30;
  if (plan === 'annual') days = 365;
  if (plan === 'lifetime') days = 36500; // ~100 years

  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let setupFeeObj = 0;
  if (paymentId) {
    const feeDetails = calculateSetupFee(tablesVal);
    setupFeeObj = {
      subtotal: feeDetails.subtotal,
      gst: feeDetails.gst,
      total: feeDetails.total,
      paymentId: paymentId,
      paidAt: new Date().toISOString(),
      tables: tablesVal
    };
  }

  const newRest = {
    id,
    name,
    ownerName: owner,
    ownerEmail: email,
    mobile,
    plan,
    tables: tablesVal,
    setupFee: setupFeeObj,
    status: 'active',
    expiryDate,
    graceStartDate: '',
    notes,
    created_at: new Date().toISOString()
  };

  if (isRealFirebase) {
    try {
      showLoadingSpinner(true);
      await setDoc(doc(db, 'restaurants', id), newRest);
      showToast("Restaurant profile created successfully!", "success");
      addRestaurantForm.reset();
      document.getElementById('setup-fee-container').classList.add('hidden');
      switchTab('restaurants');
    } catch (err) {
      showToast("Failed to save to Firebase: " + err.message, "error");
    } finally {
      showLoadingSpinner(false);
    }
  } else {
    localRestaurants.push(newRest);
    saveLocalDb();
    updateRestaurantList(localRestaurants);
    showToast("Restaurant profile created successfully in Local DB!", "success");
    addRestaurantForm.reset();
    document.getElementById('setup-fee-container').classList.add('hidden');
    switchTab('restaurants');
  }
};

// CSV Export
const exportToCSV = () => {
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Project ID,Restaurant Name,Owner Name,Mobile,Plan,Setup Fee (INR),Status,Expiry Date\n";
  
  localRestaurants.forEach(r => {
    let setupAmt = 0;
    if (r.setupFee) {
      setupAmt = typeof r.setupFee === 'object' ? r.setupFee.total : r.setupFee;
    }
    const row = `"${r.id}","${r.name}","${r.ownerName || ''}","${r.mobile || ''}","${r.plan || ''}",${setupAmt},"${r.status}","${r.expiryDate || ''}"`;
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `diningos_clients_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Tabs switcher
const switchTab = (tabId) => {
  activeTab = tabId;
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  tabContents.forEach(content => {
    content.classList.toggle('hidden', content.id !== `tab-${tabId}`);
  });
  
  // Update page title text
  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    if (tabId === 'overview') titleEl.innerText = 'Overview';
    else if (tabId === 'restaurants') titleEl.innerText = 'Restaurant Directory';
    else if (tabId === 'alerts') titleEl.innerText = 'Expiry & Alerts';
    else if (tabId === 'add-restaurant') titleEl.innerText = 'Onboard Client';
  }

  // Update hash route
  if (window.location.hash !== `#${tabId}`) {
    window.location.hash = tabId;
  }
};

const handleRouting = () => {
  const hash = window.location.hash || '#overview';
  const tabId = hash.replace('#', '');
  const validTabs = ['overview', 'restaurants', 'alerts', 'add-restaurant'];
  if (validTabs.includes(tabId)) {
    switchTab(tabId);
  }
};

const handleLogin = (e) => {
  e.preventDefault();
  const email = adminEmail.value.trim();
  const password = adminPassword.value;
  
  // Local master credentials bypass
  if (email === "admin@restaurantos.in" && password === "masteradmin2026") {
    loginError.classList.add('hidden');
    localStorage.setItem('ros_admin_session', 'true');
    showDashboard();
    showToast("Logged in via Master Session fallback.", "warning");
    return;
  }
  
  if (isRealFirebase) {
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        loginError.classList.add('hidden');
        showDashboard();
      })
      .catch((err) => {
        loginError.innerText = "Error: " + err.message;
        loginError.classList.remove('hidden');
      });
  } else {
    loginError.innerText = "Invalid credentials. Password is 'masteradmin2026'";
    loginError.classList.remove('hidden');
  }
};

const handleLogout = () => {
  if (isRealFirebase) {
    signOut(auth).then(() => showLogin());
  } else {
    localStorage.removeItem('ros_admin_session');
    showLogin();
  }
};

// Init Revenue Analytics Chart
const initRevenueChart = () => {
  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;

  if (revenueChart) {
    revenueChart.destroy();
  }

  const monthlyData = [12000, 15000, 19000, 24000, 31000, 39000, 48000, 58000, 72000, 89000, 110000, 135000];

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'MRR Growth Timeline (₹)',
        data: monthlyData,
        backgroundColor: 'rgba(139, 35, 35, 0.45)',
        borderColor: 'rgb(139, 35, 35)',
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(139, 35, 35, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: {
            color: 'rgba(51, 31, 31, 0.05)'
          },
          ticks: {
            color: '#7d6565'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#7d6565'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
};

const runRazorpayCheckout = () => {
  const tablesInput = document.getElementById('new-rest-tables');
  const tablesVal = parseInt(tablesInput.value) || 0;
  if (tablesVal <= 0) {
    showToast("Please enter a valid number of tables.", "warning");
    return;
  }
  
  const feeDetails = calculateSetupFee(tablesVal);
  const amountInPaise = Math.round(feeDetails.total * 100);
  
  // Try to use standard Razorpay checkout if script is loaded
  if (window.Razorpay) {
    const options = {
      key: "rzp_test_RosMasterKey", 
      amount: amountInPaise,
      currency: "INR",
      name: "DiningOS Setup",
      description: `Setup fee for ${tablesVal} tables`,
      handler: function (response) {
        if (response.razorpay_payment_id) {
          document.getElementById('new-rest-payment-id').value = response.razorpay_payment_id;
          showToast("Payment successful via Razorpay!", "success");
        } else {
          showToast("Razorpay response did not contain payment ID", "error");
        }
      },
      prefill: {
        name: document.getElementById('new-rest-owner').value || "",
        email: document.getElementById('new-rest-email').value || "",
        contact: document.getElementById('new-rest-mobile').value || ""
      },
      theme: {
        color: "#8b2323"
      }
    };
    try {
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.warn("Razorpay open failed, falling back to mock:", err);
      triggerMockCheckout(feeDetails.total);
    }
  } else {
    console.warn("Razorpay SDK not loaded, using mock checkout");
    triggerMockCheckout(feeDetails.total);
  }
};

const triggerMockCheckout = (totalAmount) => {
  showToast("Razorpay SDK unavailable. Triggering secure transaction simulation...", "warning");
  
  showLoadingSpinner(true);
  setTimeout(() => {
    showLoadingSpinner(false);
    const mockPaymentId = `pay_test_${Math.random().toString(36).substring(2, 11)}`;
    document.getElementById('new-rest-payment-id').value = mockPaymentId;
    showToast(`Payment of ₹${totalAmount.toFixed(2)} simulated successfully! ID: ${mockPaymentId}`, "success");
  }, 1500);
};

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  
  checkAuth();
  
  // Setup system time clock in main header
  const systemTimeDisplay = document.getElementById('system-time-display');
  if (systemTimeDisplay) {
    const updateTime = () => {
      systemTimeDisplay.innerText = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  if (searchRestaurants) {
    searchRestaurants.addEventListener('input', (e) => {
      activeSearchQuery = e.target.value;
      renderRestaurantsTable();
    });
  }

  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
  if (addRestaurantForm) addRestaurantForm.addEventListener('submit', handleAddRestaurantSubmit);
  if (editRestForm) editRestForm.addEventListener('submit', handleEditSubmit);

  if (closeDetailModal) closeDetailModal.addEventListener('click', closeDetailModalView);

  // Bind Setup Fee live calculation
  const tablesInput = document.getElementById('new-rest-tables');
  const setupFeeContainer = document.getElementById('setup-fee-container');
  const setupFeeAmount = document.getElementById('setup-fee-amount');
  const newRestSetupFee = document.getElementById('new-rest-setupfee');

  if (tablesInput) {
    const updateSetupFeeUI = () => {
      const tablesVal = parseInt(tablesInput.value) || 0;
      if (tablesVal > 0) {
        const fee = calculateSetupFee(tablesVal);
        if (setupFeeAmount) setupFeeAmount.innerText = fee.total.toFixed(2);
        if (newRestSetupFee) newRestSetupFee.value = Math.round(fee.total);
        if (setupFeeContainer) setupFeeContainer.classList.remove('hidden');
      } else {
        if (setupFeeContainer) setupFeeContainer.classList.add('hidden');
        if (newRestSetupFee) newRestSetupFee.value = 0;
      }
    };
    tablesInput.addEventListener('input', updateSetupFeeUI);
    tablesInput.addEventListener('change', updateSetupFeeUI);
  }

  // Bind Razorpay Pay Button
  const rzpPayBtn = document.getElementById('rzp-pay-btn');
  if (rzpPayBtn) {
    rzpPayBtn.addEventListener('click', runRazorpayCheckout);
  }

  // Bind Modal Action Bar buttons
  const modalCallBtn = document.getElementById('modal-call-btn');
  const modalWaBtn = document.getElementById('modal-whatsapp-btn');
  const modalEmailBtn = document.getElementById('modal-email-btn');
  const modalViewMenuBtn = document.getElementById('modal-view-menu-btn');
  const modalRenewBtn = document.getElementById('modal-renew-btn');
  const modalSuspendBtn = document.getElementById('modal-suspend-btn');
  const modalExtendBtn = document.getElementById('modal-extend-btn');

  if (modalCallBtn) {
    modalCallBtn.addEventListener('click', (e) => {
      if (!selectedRestaurant) return;
      handleCall(e, selectedRestaurant.mobile);
    });
  }
  if (modalWaBtn) {
    modalWaBtn.addEventListener('click', () => {
      if (!selectedRestaurant) return;
      const msg = getWhatsAppMessage(selectedRestaurant);
      window.open(`https://wa.me/91${selectedRestaurant.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }
  if (modalEmailBtn) {
    modalEmailBtn.addEventListener('click', async () => {
      if (!selectedRestaurant) return;
      const email = selectedRestaurant.ownerEmail || `owner@${selectedRestaurant.id}.com`;
      const { subject, body } = getEmailTemplate(selectedRestaurant);
      await sendEmail(email, selectedRestaurant.ownerName || 'Owner', selectedRestaurant.name, subject, body);
    });
  }
  if (modalViewMenuBtn) {
    modalViewMenuBtn.addEventListener('click', () => {
      if (!selectedRestaurant) return;
      const id = selectedRestaurant.id;
      const menuUrl = `${window.location.origin}/${id}/customer-menu.html`;
      window.open(menuUrl, '_blank');
    });
  }
  if (modalRenewBtn) {
    modalRenewBtn.addEventListener('click', async () => {
      if (!selectedRestaurant) return;
      await handleRenewRest(selectedRestaurant.id);
      closeDetailModalView();
    });
  }
  if (modalSuspendBtn) {
    modalSuspendBtn.addEventListener('click', async () => {
      if (!selectedRestaurant) return;
      await handleSuspendToggle(selectedRestaurant.id, true);
      closeDetailModalView();
    });
  }
  if (modalExtendBtn) {
    modalExtendBtn.addEventListener('click', async () => {
      if (!selectedRestaurant) return;
      await handleExtendTrial(selectedRestaurant.id);
      closeDetailModalView();
    });
  }

  // Setup routing listener
  window.addEventListener('hashchange', handleRouting);
  // Run initial routing check
  handleRouting();
});
