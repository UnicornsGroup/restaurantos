// Plan Checker Service for DiningOS
import { firebaseConfig } from './config.js';

// Default master functions endpoint (can be configured in config.js or default to standard fallback)
const MASTER_FUNCTIONS_URL = "https://us-central1-restaurantos-master.cloudfunctions.net";

// Cache lifetime: 12 hours (43,200,000 milliseconds)
const CACHE_TTL = 12 * 60 * 60 * 1000;

export async function checkSubscriptionPlan(isCustomer = false) {
  const projectId = firebaseConfig.projectId;
  if (!projectId || projectId === "YOUR_PROJECT_ID_HERE") {
    // If not configured, bypass plan checks in local sandbox
    console.warn("Firebase project ID is a placeholder. Subscription plan check bypassed.");
    return;
  }

  // Load from local storage cache
  let cachedData = null;
  const cacheStr = localStorage.getItem('ros_plan_cache');
  if (cacheStr) {
    try {
      cachedData = JSON.parse(cacheStr);
    } catch (_) {}
  }

  const now = Date.now();
  let planData = null;

  // Verify cache freshness
  if (cachedData && cachedData.lastChecked && (now - cachedData.lastChecked < CACHE_TTL)) {
    planData = cachedData;
  } else {
    // Cache missing or expired, fetch from Master Cloud Function
    try {
      const url = `${MASTER_FUNCTIONS_URL}/checkPlan?restaurantId=${projectId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        planData = {
          ...data,
          lastChecked: now
        };
        localStorage.setItem('ros_plan_cache', JSON.stringify(planData));
      } else {
        console.warn(`Master plan checker responded with error status: ${response.status}`);
      }
    } catch (err) {
      console.warn("Failed to contact master subscription checker. Using offline cache fallback:", err);
    }

    // Fallback if network request fails
    if (!planData) {
      if (cachedData) {
        planData = cachedData; // Fallback to stale cache
      } else {
        // Safe default: Active trial if completely offline and cacheless
        planData = {
          status: "active",
          plan: "trial",
          daysLeft: 15,
          graceDaysLeft: 0,
          lastChecked: now
        };
      }
    }
  }

  // Apply visual gates
  applyPlanGates(planData, isCustomer);
}

function applyPlanGates(planData, isCustomer) {
  const { status, plan, daysLeft, graceDaysLeft, expiryDate } = planData;
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. SUSPENDED Gate: Fullscreen blocker overlay
  if (status === 'suspended') {
    createBlockerScreen(isCustomer, planData);
    return;
  }

  // 2. GRACE period Gate: Red notification bar at the top of the viewport
  if (status === 'grace') {
    createGraceBanner(graceDaysLeft);
  }

  // 3. LIFETIME (Expired support) Gate: Soft modal warning once daily
  if (plan === 'lifetime' && daysLeft <= 0) {
    const lastDismissed = localStorage.getItem('ros_lifetime_warning_dismissed');
    if (lastDismissed !== todayStr) {
      createLifetimeWarningModal(todayStr);
    }
  }
}

function createBlockerScreen(isCustomer, planData) {
  // Check if blocker already exists
  if (document.getElementById('ros-blocker-overlay')) return;

  // Disable scrolls
  document.body.style.overflow = 'hidden';
  document.body.style.pointerEvents = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'ros-blocker-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(10, 15, 30, 0.95)';
  overlay.style.backdropFilter = 'blur(16px)';
  overlay.style.webkitBackdropFilter = 'blur(16px)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '24px';
  overlay.style.pointerEvents = 'auto'; // allow interaction with the overlay items
  overlay.style.fontFamily = "'Outfit', sans-serif";
  overlay.style.color = '#fff';

  let cardHtml = '';

  if (isCustomer) {
    cardHtml = `
      <div class="glass-panel" style="padding: 36px; max-width: 450px; width: 100%; text-align: center; border: 1px solid rgba(239, 68, 68, 0.25); box-shadow: 0 8px 32px rgba(239, 68, 68, 0.15); border-radius: 16px; background: rgba(30, 20, 20, 0.45);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; color: #ef4444; margin: 0 auto 20px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px;">Ordering Temporarily Unavailable</h2>
        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin-bottom: 24px;">
          Self-ordering via QR code is currently inactive at this table. Please request a waiter or contact restaurant staff to place your order directly.
        </p>
        <button onclick="window.location.reload()" style="background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
          Retry Scan
        </button>
      </div>
    `;
  } else {
    cardHtml = `
      <div class="glass-panel" style="padding: 40px; max-width: 500px; width: 100%; border: 1px solid rgba(239, 68, 68, 0.3); box-shadow: 0 10px 40px rgba(239, 68, 68, 0.2); border-radius: 18px; background: rgba(25, 15, 15, 0.5);">
        <div style="width: 72px; height: 72px; border-radius: 20px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); display: flex; align-items: center; justify-content: center; color: #ef4444; margin-bottom: 24px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <h2 style="font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 12px; letter-spacing: -0.02em;">DiningOS Access Suspended</h2>
        <p style="font-size: 14px; color: rgba(255,255,255,0.75); line-height: 1.65; margin-bottom: 20px;">
          The subscription plan for restaurant <strong>${firebaseConfig.projectId}</strong> has expired and the grace period has ended. Access to POS tables, billing registers, and KDS monitors is locked.
        </p>
        
        <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 18px; font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px;">
          <div><strong>Plan Expiry Date:</strong> ${planData.expiryDate || 'N/A'}</div>
          <div><strong>Grace End Date:</strong> Suspended</div>
        </div>

        <div style="display: flex; gap: 12px; width: 100%;">
          <a href="https://wa.me/919988776655?text=Hi%20support,%20my%20DiningOS%20instance%20${firebaseConfig.projectId}%20is%20suspended.%20Please%20help%20me%20renew." target="_blank" style="flex: 1; text-align: center; text-decoration: none; background: #25d366; color: #fff; border: none; padding: 14px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; transition: opacity 0.2s;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Renew via WhatsApp</span>
          </a>
        </div>
      </div>
    `;
  }

  overlay.innerHTML = cardHtml;
  document.body.appendChild(overlay);
}

function createGraceBanner(graceDaysLeft) {
  if (document.getElementById('ros-grace-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'ros-grace-banner';
  banner.style.position = 'sticky';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.width = '100%';
  banner.style.zIndex = '99999';
  banner.style.background = 'rgba(239, 68, 68, 0.9)';
  banner.style.backdropFilter = 'blur(8px)';
  banner.style.webkitBackdropFilter = 'blur(8px)';
  banner.style.borderBottom = '1px solid rgba(239, 68, 68, 0.3)';
  banner.style.color = '#fff';
  banner.style.padding = '10px 16px';
  banner.style.textAlign = 'center';
  banner.style.fontSize = '12px';
  banner.style.fontWeight = '600';
  banner.style.fontFamily = "'Outfit', sans-serif";
  banner.style.display = 'flex';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'center';
  banner.style.gap = '12px';

  banner.innerHTML = `
    <span>⚠️ Subscription Expired: Your account is in its grace period. <strong>${graceDaysLeft} days remaining</strong> before service suspension.</span>
    <a href="https://wa.me/919988776655?text=Hi%20support,%20my%20DiningOS%20instance%20${firebaseConfig.projectId}%20is%20in%20grace%20period.%20I%20need%20to%20renew." target="_blank" style="background: #fff; color: #ef4444; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 700; text-decoration: none; font-size: 11px; display: inline-block;">Renew Now</a>
  `;

  // Prepend to body
  document.body.insertBefore(banner, document.body.firstChild);
}

function createLifetimeWarningModal(todayStr) {
  if (document.getElementById('ros-lifetime-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'ros-lifetime-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.6)';
  modal.style.backdropFilter = 'blur(6px)';
  modal.style.webkitBackdropFilter = 'blur(6px)';
  modal.style.zIndex = '999998';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.padding = '24px';
  modal.style.fontFamily = "'Outfit', sans-serif";
  modal.style.color = '#fff';

  modal.innerHTML = `
    <div class="glass-panel" style="padding: 32px; max-width: 450px; width: 100%; border: 1px solid rgba(245, 158, 11, 0.25); box-shadow: 0 8px 32px rgba(245, 158, 11, 0.15); border-radius: 14px; background: rgba(30, 26, 20, 0.55); text-align: center;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); display: flex; align-items: center; justify-content: center; color: #f59e0b; margin: 0 auto 16px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px;">Support Contract Expired</h3>
      <p style="font-size: 13px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin-bottom: 20px;">
        Your lifetime software license is active, but your premium technical support package has expired. Renew your support contract to receive the latest updates and continuous troubleshooting help.
      </p>
      <div style="display: flex; gap: 10px;">
        <button id="ros-dismiss-lifetime" style="flex: 1; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;">Dismiss</button>
        <a href="https://wa.me/919988776655?text=Hi,%20I%20would%20like%20to%20renew%20the%20technical%20support%20package%20for%20my%20lifetime%20license." target="_blank" style="flex: 1; text-align: center; text-decoration: none; background: #f59e0b; color: #000; border: none; padding: 10px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px;">Renew Support</a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('ros-dismiss-lifetime').addEventListener('click', () => {
    localStorage.setItem('ros_lifetime_warning_dismissed', todayStr);
    modal.remove();
  });
}
