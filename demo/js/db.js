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

// Menu Catalog Helper Functions
const getCatalog = async () => {
  try {
    const catalogRef = doc(db, 'settings', 'menu_catalog');
    const docSnap = await getDoc(catalogRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        categories: data.categories || [],
        items: data.items || []
      };
    }
    return { categories: [], items: [] };
  } catch (err) {
    console.error("Failed to read menu catalog:", err);
    throw err;
  }
};

const saveCatalog = async (categories, items) => {
  try {
    const catalogRef = doc(db, 'settings', 'menu_catalog');
    await setDoc(catalogRef, {
      categories,
      items,
      updated_at: serverTimestamp()
    });

    // Automatically update menuVersion in settings/restaurant document
    const restaurantRef = doc(db, 'settings', 'restaurant');
    const versionStr = Date.now().toString();
    await setDoc(restaurantRef, {
      menuVersion: versionStr,
      updated_at: serverTimestamp()
    }, { merge: true });

    // Update local storage cache
    const local = localStorage.getItem('settings_restaurant');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        parsed.menuVersion = versionStr;
        localStorage.setItem('settings_restaurant', JSON.stringify(parsed));
      } catch (_) {}
    }
  } catch (err) {
    console.error("Failed to write menu catalog:", err);
    throw err;
  }
};

export const saveBulkCatalog = async (categories, items) => {
  try {
    await saveCatalog(categories, items);
    return true;
  } catch (err) {
    console.error("Failed to save bulk catalog:", err);
    throw err;
  }
};

// Menu Categories Database CRUD
export const addMenuCategory = async (name, displayOrder, routing) => {
  try {
    const { categories, items } = await getCatalog();
    const newId = 'cat_' + Date.now();
    categories.push({
      id: newId,
      name,
      display_order: parseInt(displayOrder) || 1,
      routing: routing || 'kitchen',
      created_at: Date.now()
    });
    await saveCatalog(categories, items);
    return newId;
  } catch (err) {
    console.error("Failed to create category:", err);
    throw err;
  }
};

export const deleteMenuCategory = async (catId) => {
  try {
    const { categories, items } = await getCatalog();
    const updatedCategories = categories.filter(c => c.id !== catId);
    const updatedItems = items.filter(i => i.category_id !== catId);
    await saveCatalog(updatedCategories, updatedItems);
    return true;
  } catch (err) {
    console.error("Failed to delete category:", err);
    throw err;
  }
};

// Menu Items Database CRUD
export const saveMenuItem = async (itemId, payload) => {
  try {
    const { categories, items } = await getCatalog();
    
    // Generate URL safe slug
    const slugName = payload.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Resolve relative path for image to match format: images/menu/{slug}.{ext}
    let ext = 'jpg';
    if (payload.imageExtension) {
      ext = payload.imageExtension;
    } else if (payload.image && payload.image.includes('.')) {
      const parts = payload.image.split('.');
      ext = parts[parts.length - 1];
    }
    
    const imagePath = `images/menu/${slugName}.${ext}`;

    const itemData = {
      category_id: payload.category_id,
      category_name: payload.category_name,
      name: payload.name,
      description: payload.description,
      price: parseFloat(payload.price) || 0,
      prep_time: parseInt(payload.prep_time) || 15,
      tags: payload.tags || [],
      allergens: payload.allergens || [],
      slug: slugName,
      image: imagePath,
      is_available: payload.hasOwnProperty('is_available') ? payload.is_available : true,
      modifierGroups: payload.modifierGroups || []
    };

    if (itemId) {
      const idx = items.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        const existing = items[idx];
        items[idx] = {
          ...existing,
          ...itemData,
          id: itemId,
          updated_at: Date.now()
        };
      }
      await saveCatalog(categories, items);
      return itemId;
    } else {
      const newId = 'item_' + Date.now();
      items.push({
        ...itemData,
        id: newId,
        is_available: true,
        created_at: Date.now()
      });
      await saveCatalog(categories, items);
      return newId;
    }
  } catch (err) {
    console.error("Failed to save menu item:", err);
    throw err;
  }
};

export const toggleItemAvailability = async (itemId, currentAvailability) => {
  try {
    const { categories, items } = await getCatalog();
    const idx = items.findIndex(i => i.id === itemId);
    if (idx !== -1) {
      items[idx].is_available = !currentAvailability;
      await saveCatalog(categories, items);
    }
    return true;
  } catch (err) {
    console.error("Failed to toggle item availability:", err);
    throw err;
  }
};

export const deleteMenuItem = async (itemId) => {
  try {
    const { categories, items } = await getCatalog();
    const updatedItems = items.filter(i => i.id !== itemId);
    await saveCatalog(categories, updatedItems);
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
