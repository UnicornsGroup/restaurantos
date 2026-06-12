// Universal Authentication and Route Guard service for DiningOS
import { 
  auth, 
  db, 
  doc, 
  setDoc, 
  getDoc, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from './firebase-config.js';
import { restaurantConfig } from './config.js';

// Determine if the current page is a public (non-protected) route
const isCurrentPagePublic = () => {
  const path = window.location.pathname;
  return path.includes('/index.html') ||
         path.includes('/customer-menu.html') ||
         path.includes('/setup.html') ||
         path === '/' ||
         path.endsWith('/');
};

// Determine if the current page is a staff-protected route that needs header injection
const isCurrentPageProtected = () => {
  const path = window.location.pathname;
  return !path.includes('/index.html') &&
         !path.includes('/customer-menu.html') &&
         !path.includes('/setup.html') &&
         path !== '/' &&
         !path.endsWith('/');
};

// Initialize Authentication logic & Route Guards
// activeTabId: The nav tab to highlight ('tables', 'order', 'kitchen', 'dashboard', 'menu-builder', 'table-setup')
// onAuthSuccess: callback(user, restaurant) when auth is verified
export const initAuthGuard = (activeTabId, onAuthSuccess) => {
  // Check subscription plan status in background and apply blockades/banners
  import('./plan-checker.js').then(({ checkSubscriptionPlan }) => {
    checkSubscriptionPlan(false).catch(err => console.error("Plan check failed:", err));
  });

  if (!auth) return;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        // 1. Fetch User profile metadata
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        let currentUser = null;
        
        if (userDoc.exists()) {
          currentUser = { id: user.uid, ...userDoc.data() };
        } else {
          // Fallback Auto-Initialization if manually added via Firebase console
          currentUser = {
            id: user.uid,
            name: "POS Owner Admin",
            email: user.email.toLowerCase(),
            role: 'owner',
            created_at: new Date()
          };
          await setDoc(userDocRef, {
            name: currentUser.name,
            email: currentUser.email,
            role: currentUser.role,
            created_at: currentUser.created_at
          });
        }

        // 2. Fetch active settings config
        let currentRestaurant = null;
        try {
          const settingsSnap = await getDoc(doc(db, 'settings', 'restaurant'));
          if (settingsSnap.exists()) {
            currentRestaurant = settingsSnap.data();
          } else {
            currentRestaurant = restaurantConfig;
          }
        } catch (err) {
          currentRestaurant = restaurantConfig;
        }

        // Cache settings locally for fast fallback
        localStorage.setItem('settings_restaurant', JSON.stringify(currentRestaurant));
        
        // 2.5. Role-based Route Guard: Kitchen staff can ONLY access kitchen.html
        if (currentUser.role === 'kitchen') {
          const path = window.location.pathname;
          if (!path.includes('kitchen.html')) {
            window.location.href = "kitchen.html";
            return;
          }
        }

        // 2.6. Role-based Route Guard: Waiter staff can ONLY access tables.html and customer-menu.html
        if (currentUser.role === 'waiter') {
          const path = window.location.pathname;
          if (!path.includes('tables.html') && !path.includes('customer-menu.html')) {
            window.location.href = "tables.html";
            return;
          }
        }
        
        // 3. Dynamically inject navigation layout header on protected staff views
        if (isCurrentPageProtected()) {
          const { injectHeader } = await import('./utils.js');
          injectHeader(activeTabId, currentUser, currentRestaurant);
        }

        // Initialize waiter real-time notifications if role matches
        if (currentUser.role === 'waiter') {
          const { initWaiterNotifications } = await import('./waiter-notifications.js');
          initWaiterNotifications(currentUser);
        }
        
        // 4. Trigger downstream page-specific initialization
        if (onAuthSuccess) onAuthSuccess(currentUser, currentRestaurant);

      } catch (err) {
        console.error("Session initialization failed:", err);
        // Fallback redirect if error on a secure route
        if (isCurrentPageProtected()) {
          window.location.href = "index.html";
        }
      }
    } else {
      // Clear local settings cache on logout
      localStorage.removeItem('settings_restaurant');

      // Redirect to login if user is on a protected route
      if (isCurrentPageProtected()) {
        window.location.href = "index.html";
      } else {
        // On public pages, still call the callback with null user
        // This allows index.html to render login UI, etc.
        if (onAuthSuccess) onAuthSuccess(null, null);
      }
    }
  });
};

// Handle Login form submission
export const handleLogin = async (email, password) => {
  if (auth) {
    return signInWithEmailAndPassword(auth, email, password);
  }
  throw new Error("Firebase Auth service not configured.");
};

// Handle Log Out
export const handleLogout = async () => {
  if (auth) {
    await signOut(auth);
    window.location.href = "index.html";
  }
};
