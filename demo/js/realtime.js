// Firestore Realtime snapshot subscriptions manager for RestaurantOS
import {
  db,
  collection,
  doc,
  query,
  where,
  onSnapshot
} from './firebase-config.js';

// Subscribe to Branding settings
export const subscribeSettings = (callback, errorCallback) => {
  const settingsRef = doc(db, 'settings', 'restaurant');
  return onSnapshot(settingsRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe settings updates:", err);
  });
};

// Subscribe to tables layout grid
export const subscribeTables = (callback, errorCallback) => {
  const q = collection(db, 'tables');
  return onSnapshot(q, (snapshot) => {
    const tables = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(tables);
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe tables layout updates:", err);
  });
};

// Subscribe to menu categories
export const subscribeCategories = (callback, errorCallback) => {
  const catalogRef = doc(db, 'settings', 'menu_catalog');
  return onSnapshot(catalogRef, (docSnap) => {
    const data = docSnap.exists() ? docSnap.data() : {};
    const categories = data.categories || [];
    callback(categories);
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe categories updates:", err);
  });
};

// Subscribe to menu items list
export const subscribeItems = (callback, errorCallback) => {
  const catalogRef = doc(db, 'settings', 'menu_catalog');
  return onSnapshot(catalogRef, (docSnap) => {
    const data = docSnap.exists() ? docSnap.data() : {};
    const items = data.items || [];
    callback(items);
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe menu items updates:", err);
  });
};

// Subscribe to active KDS order feed
export const subscribeKdsOrders = (callback, errorCallback) => {
  const q = query(
    collection(db, 'orders'),
    where('status', 'in', ['received', 'preparing', 'ready'])
  );
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe kitchen feed updates:", err);
  });
};

// Subscribe to all orders (for dashboard and cashier analytics)
export const subscribeAllOrders = (callback, errorCallback) => {
  const q = collection(db, 'orders');
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  }, (err) => {
    if (errorCallback) errorCallback(err);
    else console.warn("Failed to subscribe dashboard order updates:", err);
  });
};
