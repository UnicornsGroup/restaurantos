import { initAuthGuard } from './auth.js';
import { db, collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from './firebase-config.js';
import { toggleModal } from './utils.js';
import { subscribeTables } from './realtime.js';
import { firebaseConfig } from './config.js';
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let activeUser = null;
let activeRestaurant = null;

let tablesList = [];
let staffList = [];
let editingUserId = null;

// DOM references
const staffGrid = document.getElementById('staff-grid');
const addStaffBtn = document.getElementById('add-staff-btn');
const staffModal = document.getElementById('staff-modal');
const closeStaffModal = document.getElementById('close-staff-modal');
const staffForm = document.getElementById('staff-form');
const tablesCheckboxGrid = document.getElementById('tables-checkbox-grid');
const roleSelect = document.getElementById('staff-role');
const waiterTablesContainer = document.getElementById('waiter-tables-container');
const passwordWrapper = document.getElementById('password-field-wrapper');
const staffPasswordInput = document.getElementById('staff-password');
const staffEmailInput = document.getElementById('staff-email');

const initStaffPage = () => {
  // Subscribe to table layouts for assignments checkbox list
  subscribeTables((tables) => {
    tablesList = tables.sort((a, b) => String(a.table_number || '').localeCompare(String(b.table_number || '')));
    renderTablesCheckboxes();
  });

  // Load staff list
  loadStaff();

  // Role select visibility changes
  if (roleSelect && waiterTablesContainer) {
    roleSelect.addEventListener('change', (e) => {
      waiterTablesContainer.style.display = e.target.value === 'waiter' ? 'block' : 'none';
    });
  }

  // Bind Add Staff Member click
  if (addStaffBtn) {
    addStaffBtn.addEventListener('click', () => {
      editingUserId = null;
      document.getElementById('staff-modal-title').innerText = 'Add Staff Member';
      staffForm.reset();
      
      // Email is editable for new accounts
      if (staffEmailInput) {
        staffEmailInput.readOnly = false;
        staffEmailInput.style.opacity = '1';
        staffEmailInput.style.cursor = 'text';
      }

      // Password is required for new accounts
      if (passwordWrapper && staffPasswordInput) {
        passwordWrapper.style.display = 'block';
        staffPasswordInput.required = true;
      }
      
      // Default hide table checklist unless waiter is selected by default
      if (waiterTablesContainer) waiterTablesContainer.style.display = 'block';
      if (roleSelect) roleSelect.value = 'waiter';

      // Uncheck all checkboxes
      document.querySelectorAll('.table-assign-checkbox').forEach(cb => cb.checked = false);

      toggleModal(staffModal, true);
    });
  }

  if (closeStaffModal) {
    closeStaffModal.addEventListener('click', () => toggleModal(staffModal, false));
  }

  // Handle Form submit
  if (staffForm) {
    staffForm.addEventListener('submit', handleStaffFormSubmit);
  }
};

const loadStaff = async () => {
  try {
    const q = collection(db, 'users');
    const snap = await getDocs(q);
    staffList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderStaffGrid();
  } catch (err) {
    console.error("Failed to load staff list:", err);
    const alertError = document.getElementById('staff-alert-error');
    if (alertError) {
      document.getElementById('staff-error-text').innerText = 'Failed to load staff accounts. Verify database read permissions.';
      alertError.classList.remove('hidden');
      setTimeout(() => alertError.classList.add('hidden'), 4000);
    }
  }
};

const renderTablesCheckboxes = () => {
  if (!tablesCheckboxGrid) return;
  
  if (tablesList.length === 0) {
    tablesCheckboxGrid.innerHTML = '<p style="font-size: 11px; color: var(--text-muted); grid-column: 1 / -1; text-align: center; margin: 8px 0;">No tables found. Create them in QR Setup first.</p>';
    return;
  }

  tablesCheckboxGrid.innerHTML = '';
  tablesList.forEach(table => {
    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #fff;
      cursor: pointer;
      text-transform: none;
      font-weight: 500;
      margin-bottom: 0;
    `;
    label.innerHTML = `
      <input type="checkbox" class="table-assign-checkbox" value="${table.id}" style="width: 16px; height: 16px; margin-right: 4px; cursor: pointer;">
      <span>${table.table_number} (${table.capacity || 0} Pax)</span>
    `;
    tablesCheckboxGrid.appendChild(label);
  });
};

const renderStaffGrid = () => {
  if (!staffGrid) return;
  staffGrid.innerHTML = '';

  if (staffList.length === 0) {
    staffGrid.innerHTML = `
      <div class="glass-panel" style="padding: 32px; text-align: center; grid-column: 1 / -1;">
        <p style="font-size: 13px; color: var(--text-muted);">No staff members registered.</p>
      </div>
    `;
    return;
  }

  staffList.forEach(staff => {
    // Format Role
    let roleText = staff.role || 'Staff';
    let badgeClass = 'badge-secondary';
    if (staff.role === 'owner') {
      roleText = 'Owner Admin';
      badgeClass = 'badge-success';
    } else if (staff.role === 'manager') {
      roleText = 'Manager';
      badgeClass = 'badge-warning';
    } else if (staff.role === 'cashier') {
      roleText = 'Cashier/Billing';
      badgeClass = 'badge-success';
    } else if (staff.role === 'kitchen') {
      roleText = 'Kitchen Staff';
      badgeClass = 'badge-danger';
    } else if (staff.role === 'waiter') {
      roleText = 'Waiter';
      badgeClass = 'badge-warning';
    }

    // Get table assignments list
    let assignedNames = 'None';
    if (staff.role === 'waiter' && Array.isArray(staff.assigned_tables) && staff.assigned_tables.length > 0) {
      const namesList = staff.assigned_tables.map(tid => {
        const tbl = tablesList.find(t => t.id === tid);
        return tbl ? tbl.table_number : null;
      }).filter(Boolean);
      assignedNames = namesList.length > 0 ? namesList.join(', ') : 'None';
    }

    const card = document.createElement('div');
    card.className = 'glass-panel menu-item-card';
    card.style.padding = '20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.justifyContent = 'space-between';
    card.style.gap = '14px';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <h4 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0;">${staff.name || 'Anonymous User'}</h4>
          <span class="badge ${badgeClass}">${roleText}</span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px; word-break: break-all;">
          <i data-lucide="mail" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>
          ${staff.email}
        </p>
        ${staff.role === 'waiter' ? `
          <div style="margin-top: 12px; font-size: 12px; background: hsla(222, 47%, 2%, 0.6); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
            <strong style="color: var(--text-muted);">Assigned Tables:</strong>
            <span style="color: #fff; margin-left: 4px;">${assignedNames}</span>
          </div>
        ` : ''}
      </div>
      <div style="display: flex; gap: 10px; margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <button class="btn btn-secondary btn-edit-staff" data-id="${staff.id}" style="padding: 6px 12px; font-size: 12px; flex: 1;">
          <i data-lucide="edit" style="width: 12px; height: 12px;"></i>
          <span>Edit Account</span>
        </button>
        ${staff.role !== 'owner' ? `
          <button class="btn btn-danger btn-delete-staff" data-id="${staff.id}" style="padding: 6px 12px; font-size: 12px; flex: 1;">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            <span>Delete</span>
          </button>
        ` : `<div style="flex:1;"></div>`}
      </div>
    `;
    staffGrid.appendChild(card);
  });

  // Bind edit buttons
  document.querySelectorAll('.btn-edit-staff').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-id');
      const staff = staffList.find(s => s.id === targetId);
      if (staff) openEditStaffModal(staff);
    });
  });

  // Bind delete buttons
  document.querySelectorAll('.btn-delete-staff').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-id');
      handleDeleteStaff(targetId);
    });
  });

  if (window.lucide) lucide.createIcons();
};

const openEditStaffModal = (staff) => {
  editingUserId = staff.id;
  document.getElementById('staff-modal-title').innerText = 'Edit Staff Member';
  
  const nameEl = document.getElementById('staff-name');
  if (nameEl) nameEl.value = staff.name || '';
  if (staffEmailInput) {
    staffEmailInput.value = staff.email || '';
    staffEmailInput.readOnly = true; // Email cannot be edited
    staffEmailInput.style.opacity = '0.6';
    staffEmailInput.style.cursor = 'not-allowed';
  }

  // Password fields are not needed/allowed when editing
  if (passwordWrapper && staffPasswordInput) {
    passwordWrapper.style.display = 'none';
    staffPasswordInput.required = false;
    staffPasswordInput.value = '';
  }

  if (roleSelect) roleSelect.value = staff.role || 'waiter';
  if (waiterTablesContainer) {
    waiterTablesContainer.style.display = staff.role === 'waiter' ? 'block' : 'none';
  }

  // Populate checkboxes
  document.querySelectorAll('.table-assign-checkbox').forEach(cb => {
    cb.checked = Array.isArray(staff.assigned_tables) && staff.assigned_tables.includes(cb.value);
  });

  toggleModal(staffModal, true);
};

const handleStaffFormSubmit = async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('staff-name').value.trim();
  const email = staffEmailInput.value.trim();
  const password = staffPasswordInput.value;
  const role = roleSelect.value;
  
  const assignedTables = [];
  document.querySelectorAll('.table-assign-checkbox:checked').forEach(cb => {
    assignedTables.push(cb.value);
  });

  const submitBtn = document.getElementById('staff-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Saving Account...';

  const alertSuccess = document.getElementById('staff-alert-success');
  const alertError = document.getElementById('staff-alert-error');
  if (alertSuccess) alertSuccess.classList.add('hidden');
  if (alertError) alertError.classList.add('hidden');

  try {
    if (editingUserId) {
      // Editing existing staff member in Firestore
      await updateDoc(doc(db, 'users', editingUserId), {
        name,
        role,
        assigned_tables: role === 'waiter' ? assignedTables : []
      });
      
      if (alertSuccess) {
        document.getElementById('staff-success-text').innerText = 'Staff details updated successfully!';
        alertSuccess.classList.remove('hidden');
        setTimeout(() => alertSuccess.classList.add('hidden'), 3500);
      }
      toggleModal(staffModal, false);
      loadStaff();
    } else {
      // Creating new staff member in Firebase Auth & Firestore
      // Use secondary app to prevent local session sign out
      let secondaryApp;
      if (getApps().some(app => app.name === "SecondaryRegistration")) {
        secondaryApp = getApp("SecondaryRegistration");
      } else {
        secondaryApp = initializeApp(firebaseConfig, "SecondaryRegistration");
      }
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = userCredential.user.uid;
      
      // Sign out from secondary app immediately
      await signOut(secondaryAuth);
      
      // Write to Firestore users collection
      await setDoc(doc(db, 'users', newUid), {
        name,
        email: email.toLowerCase(),
        role,
        assigned_tables: role === 'waiter' ? assignedTables : [],
        created_at: new Date()
      });

      if (alertSuccess) {
        document.getElementById('staff-success-text').innerText = 'New staff member registered successfully!';
        alertSuccess.classList.remove('hidden');
        setTimeout(() => alertSuccess.classList.add('hidden'), 3500);
      }
      toggleModal(staffModal, false);
      loadStaff();
    }
  } catch (err) {
    console.error("Staff save failed:", err);
    if (alertError) {
      let friendlyMsg = err.message || 'Failed to save staff configurations.';
      if (err.code === 'auth/email-already-in-use') {
        friendlyMsg = 'This email is already registered to another staff member or owner.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMsg = 'The password must be at least 6 characters long.';
      } else if (err.code === 'auth/invalid-email') {
        friendlyMsg = 'The email address is invalid.';
      } else if (err.message && err.message.toLowerCase().includes('permission')) {
        friendlyMsg = 'Database permission denied. Make sure firestore.rules are copied to your Firebase Console.';
      }
      document.getElementById('staff-error-text').innerText = 'Error: ' + friendlyMsg;
      alertError.classList.remove('hidden');
      setTimeout(() => alertError.classList.add('hidden'), 5000);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Save Staff Account';
  }
};

const handleDeleteStaff = async (userId) => {
  const staff = staffList.find(s => s.id === userId);
  if (!staff) return;

  const conf = confirm(`Are you sure you want to delete staff account "${staff.name}"?\n\nThis will immediately revoke all POS terminal access.`);
  if (!conf) return;

  const alertSuccess = document.getElementById('staff-alert-success');
  const alertError = document.getElementById('staff-alert-error');
  if (alertSuccess) alertSuccess.classList.add('hidden');
  if (alertError) alertError.classList.add('hidden');

  try {
    await deleteDoc(doc(db, 'users', userId));
    
    if (alertSuccess) {
      document.getElementById('staff-success-text').innerText = 'Staff access deleted and credentials revoked!';
      alertSuccess.classList.remove('hidden');
      setTimeout(() => alertSuccess.classList.add('hidden'), 3500);
    }
    loadStaff();
  } catch (err) {
    console.error("Staff deletion failed:", err);
    if (alertError) {
      let friendlyMsg = err.message || 'Check firestore rule permissions.';
      if (err.message && err.message.toLowerCase().includes('permission')) {
        friendlyMsg = 'Database permission denied. Make sure firestore.rules are copied to your Firebase Console.';
      }
      document.getElementById('staff-error-text').innerText = 'Deletion failed: ' + friendlyMsg;
      alertError.classList.remove('hidden');
      setTimeout(() => alertError.classList.add('hidden'), 5000);
    }
  }
};

// Start protected initialization
window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('staff', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    
    // Only owners can manage staff profiles
    if (activeUser.role !== 'owner') {
      alert("Access denied! Staff configurations can only be managed by the Restaurant Owner Admin.");
      window.location.href = "dashboard.html";
      return;
    }
    
    initStaffPage();
  });
});
