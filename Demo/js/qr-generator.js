// QR Code utility services for RestaurantOS
import { restaurantConfig } from './config.js';

// Create dynamic table scan QR link pointing to customer mobile menu
// Always uses the current qrBaseUrl from config.js (not what's stored in Firestore)
export const generateTableQrUrl = (tableId) => {
  const origin = restaurantConfig.qrBaseUrl || window.location.origin;
  const customerUrl = `${origin}/customer-menu.html?t=${tableId}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`;
};

// Trigger download / print view of QR card
export const downloadQrCode = (qrCodeUrl) => {
  if (qrCodeUrl) {
    window.open(qrCodeUrl, '_blank');
  }
};
