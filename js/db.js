// Firestore CRUD database service operations for RestaurantOS
import {
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from './firebase-config.js';

// Settings Database CRUD
export const getRestaurantSettings = async () => {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'restaurant'));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.error("Failed to read settings from Firestore:", err);
    throw err;
  }
};

export const saveRestaurantSettings = async (settings) => {
  try {
    const settingsRef = doc(db, 'settings', 'restaurant');
    await setDoc(settingsRef, {
      ...settings,
      updated_at: serverTimestamp()
    }, { merge: true });
    
    // Cache locally
    localStorage.setItem('settings_restaurant', JSON.stringify(settings));
    return true;
  } catch (err) {
    console.error("Failed to save settings to Firestore:", err);
    throw err;
  }
};

// Guest / Customer Registration CRUD
// Mobile number is used as the document ID for O(1) lookup
export const getGuest = async (mobile) => {
  try {
    const snap = await getDoc(doc(db, 'guests', mobile));
    return snap.exists() ? { mobile, ...snap.data() } : null;
  } catch (err) {
    console.error("Failed to fetch guest profile:", err);
    return null;
  }
};

export const saveGuest = async (mobile, name) => {
  try {
    const guestRef = doc(db, 'guests', mobile);
    const existing = await getDoc(guestRef);

    if (existing.exists()) {
      // Returning guest — increment visit count
      await updateDoc(guestRef, {
        visit_count: (existing.data().visit_count || 1) + 1,
        last_visit: serverTimestamp()
      });
    } else {
      // New guest — create record
      await setDoc(guestRef, {
        name,
        mobile,
        visit_count: 1,
        created_at: serverTimestamp(),
        last_visit: serverTimestamp()
      });
    }
    return { name, mobile };
  } catch (err) {
    console.error("Failed to save guest profile:", err);
    throw err;
  }
};

// Tables Database CRUD
export const addSeatingTable = async (tableNumber, capacity, hostOrigin) => {
  try {
    const tableRef = doc(collection(db, 'tables'));
    const tableId = tableRef.id;

    // Generate table customer QR menu URL
    const customerUrl = `${hostOrigin}/customer-menu.html?t=${tableId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`;

    await setDoc(tableRef, {
      table_number: tableNumber,
      capacity: parseInt(capacity),
      status: 'free',
      current_guest_name: '',
      current_guest_mobile: '',
      qr_code_url: qrCodeUrl,
      created_at: serverTimestamp()
    });
    return tableId;
  } catch (err) {
    console.error("Failed to create table configuration:", err);
    throw err;
  }
};

export const deleteSeatingTable = async (tableId) => {
  try {
    await deleteDoc(doc(db, 'tables', tableId));
    return true;
  } catch (err) {
    console.error("Failed to delete table configuration:", err);
    throw err;
  }
};

export const updateTableStatus = async (tableId, status) => {
  try {
    if (!tableId) return;
    const payload = { status };
    if (status === 'free') {
      payload.current_guest_name = '';
      payload.current_guest_mobile = '';
    }
    await updateDoc(doc(db, 'tables', tableId), payload);
  } catch (err) {
    console.error("Failed to update table status:", err);
  }
};

// Menu Categories Database CRUD
export const addMenuCategory = async (name, displayOrder, routing) => {
  try {
    const catRef = await addDoc(collection(db, 'menu_categories'), {
      name,
      display_order: parseInt(displayOrder) || 1,
      routing: routing || 'kitchen',
      created_at: serverTimestamp()
    });
    return catRef.id;
  } catch (err) {
    console.error("Failed to create category:", err);
    throw err;
  }
};

export const deleteMenuCategory = async (catId) => {
  try {
    await deleteDoc(doc(db, 'menu_categories', catId));
    return true;
  } catch (err) {
    console.error("Failed to delete category:", err);
    throw err;
  }
};

// Menu Items Database CRUD
export const saveMenuItem = async (itemId, payload) => {
  try {
    if (itemId) {
      await updateDoc(doc(db, 'menu_items', itemId), payload);
      return itemId;
    } else {
      const itemRef = await addDoc(collection(db, 'menu_items'), {
        ...payload,
        is_available: true,
        created_at: serverTimestamp()
      });
      return itemRef.id;
    }
  } catch (err) {
    console.error("Failed to save menu item:", err);
    throw err;
  }
};

export const toggleItemAvailability = async (itemId, currentAvailability) => {
  try {
    await updateDoc(doc(db, 'menu_items', itemId), {
      is_available: !currentAvailability
    });
    return true;
  } catch (err) {
    console.error("Failed to toggle item availability:", err);
    throw err;
  }
};

export const deleteMenuItem = async (itemId) => {
  try {
    await deleteDoc(doc(db, 'menu_items', itemId));
    return true;
  } catch (err) {
    console.error("Failed to delete menu item:", err);
    throw err;
  }
};

// Orders Database CRUD
export const createCustomerOrder = async (orderPayload) => {
  try {
    const orderRef = await addDoc(collection(db, 'orders'), {
      ...orderPayload,
      created_at: serverTimestamp()
    });
    
    // Automatically set table to occupied if table context exists
    if (orderPayload.table_id) {
      await updateTableStatus(orderPayload.table_id, 'occupied');
    }
    
    return orderRef.id;
  } catch (err) {
    console.error("Failed to submit client order:", err);
    throw err;
  }
};

export const updateOrderStatus = async (orderId, nextStatus, tableId = null) => {
  try {
    await updateDoc(doc(db, 'orders', orderId), { status: nextStatus });
    
    // If order is cancelled, release the table status back to 'free'
    if (nextStatus === 'cancelled' && tableId) {
      await updateTableStatus(tableId, 'free');
    }
    return true;
  } catch (err) {
    console.error("Failed to transition KDS status:", err);
    throw err;
  }
};
