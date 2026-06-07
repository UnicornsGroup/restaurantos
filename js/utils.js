// Shared UI and Utility functions for RestaurantOS

// Inject global navigation header across POS panels dynamically
export const injectHeader = (activeTabId, currentUser, currentRestaurant) => {
  const header = document.querySelector('header.main-header') || document.getElementById('shared-header');
  if (!header) return;

  const restName = currentRestaurant?.name || "Dev Cafe";
  const restLogo = currentRestaurant?.logoUrl || "";
  const userName = currentUser?.name || "Staff Member";
  const userRole = currentUser?.role || "Staff";

  // Build the layout HTML
  header.className = "main-header";
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 24px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        ${restLogo ? `<img src="${restLogo}" style="width: 36px; height: 36px; border-radius: 10px; object-fit: cover; border: 1px solid hsla(262,83%,58%,0.2); box-shadow: 0 3px 8px rgba(0,0,0,0.35);" alt="Logo">` : 
                     `<div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--primary), hsl(262, 83%, 38%)); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px var(--primary-glow);">
                        <i data-lucide="sparkles" style="width: 18px; height: 18px; color: white;"></i>
                      </div>`}
        <div>
          <h1 id="profile-restaurant-name" style="font-size: 14px; font-weight: 700; color: #f1f5f9;">${restName}</h1>
          <span style="font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; color: var(--primary-hover);">RestaurantOS Portal</span>
        </div>
      </div>

      <!-- Header Navigation tabs -->
      <nav class="header-nav">
        ${currentUser?.role === 'kitchen' ? `
          <a href="kitchen.html" class="tab-btn ${activeTabId === 'kitchen' ? 'active' : ''}" id="nav-kitchen">
            <i data-lucide="chef-hat" style="width: 16px; height: 16px;"></i>
            <span>Kitchen KDS</span>
          </a>
        ` : `
          <a href="tables.html" class="tab-btn ${activeTabId === 'tables' ? 'active' : ''}" id="nav-tables">
            <i data-lucide="layout-grid" style="width: 16px; height: 16px;"></i>
            <span>Tables</span>
          </a>
          <a href="order.html" class="tab-btn ${activeTabId === 'order' ? 'active' : ''}" id="nav-order">
            <i data-lucide="shopping-cart" style="width: 16px; height: 16px;"></i>
            <span>POS Billing</span>
          </a>
          <a href="kitchen.html" class="tab-btn ${activeTabId === 'kitchen' ? 'active' : ''}" id="nav-kitchen">
            <i data-lucide="chef-hat" style="width: 16px; height: 16px;"></i>
            <span>Kitchen KDS</span>
          </a>
          <a href="menu-builder.html" class="tab-btn ${activeTabId === 'menu-builder' ? 'active' : ''}" id="nav-menu">
            <i data-lucide="book-open" style="width: 16px; height: 16px;"></i>
            <span>Menu</span>
          </a>
          <a href="table-setup.html" class="tab-btn ${activeTabId === 'table-setup' ? 'active' : ''}" id="nav-qr">
            <i data-lucide="qr-code" style="width: 16px; height: 16px;"></i>
            <span>QR Setup</span>
          </a>
          <a href="dashboard.html" class="tab-btn ${activeTabId === 'dashboard' ? 'active' : ''}" id="nav-dashboard">
            <i data-lucide="bar-chart-3" style="width: 16px; height: 16px;"></i>
            <span>Dashboard</span>
          </a>
          <a href="settings.html" class="tab-btn ${activeTabId === 'settings' ? 'active' : ''}" id="nav-settings" style="opacity: 0.8;">
            <i data-lucide="settings-2" style="width: 16px; height: 16px;"></i>
            <span>Settings</span>
          </a>
        `}
      </nav>
    </div>

    <!-- Right section user and log out -->
    <div style="display: flex; align-items: center; gap: 16px;">
      <div style="display: flex; flex-direction: column; align-items: flex-end;">
        <span style="font-size: 13px; font-weight: 600; color: #e2e8f0;">${userName}</span>
        <span style="font-size: 10px; text-transform: uppercase; font-weight: 600; color: var(--primary-hover); letter-spacing: 0.05em;">${userRole}</span>
      </div>
      <button id="logout-btn" style="cursor: pointer; display: flex; align-items: center; gap: 8px; background: hsla(222, 47%, 12%, 0.6); border: 1px solid var(--border-color); color: var(--text-muted); padding: 8px 14px; border-radius: 10px; font-size: 13px; font-family: var(--font-sans); transition: all 0.2s ease;">
        <i data-lucide="log-out" style="width: 16px; height: 16px;"></i>
        <span>Log Out</span>
      </button>
    </div>
  `;


  // Initialize Lucide icons inside injected header
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Attach logout action trigger
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { handleLogout } = await import('./auth.js');
      await handleLogout();
    });
  }
};

// Toggle Modal Helper
export const toggleModal = (modalElement, forceOpen) => {
  if (!modalElement) return;
  if (forceOpen) {
    modalElement.classList.add('active');
  } else {
    modalElement.classList.remove('active');
  }
};

// Show Toast Alerts
export const showAlert = (containerEl, message, type = 'success') => {
  if (!containerEl) return;
  containerEl.className = `text-xs p-3 rounded-lg mb-4`;
  if (type === 'success') {
    containerEl.classList.add('text-emerald-400', 'bg-emerald-950/20', 'border', 'border-emerald-900/30');
  } else {
    containerEl.classList.add('text-red-400', 'bg-red-950/20', 'border', 'border-red-900/30');
  }
  containerEl.innerText = message;
  containerEl.classList.remove('hidden');
  setTimeout(() => containerEl.classList.add('hidden'), 3500);
};

// Format Pricing details
export const formatPrice = (amount, symbol = '₹') => {
  return `${symbol}${parseFloat(amount || 0).toFixed(2)}`;
};

// Parse URL param
export const getUrlParam = (paramName) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(paramName);
};
