// DiningOS Serverless Settings & Customization
export const firebaseConfig = {
  apiKey: "AIzaSyDAQ97SW9nC_ptq8uM3zRYzsUNw0EK1ToY",
  authDomain: "restaurantos-9ab2a.firebaseapp.com",
  projectId: "restaurantos-9ab2a",
  storageBucket: "restaurantos-9ab2a.firebasestorage.app",
  messagingSenderId: "193027844222",
  appId: "1:193027844222:web:f237d98af4b6e7f4f2d02f"
};

// Auto-detect public URL with subdirectory path if empty
const getAutoQrBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash > 0) {
      return `${origin}${pathname.substring(0, lastSlash)}`;
    }
    return origin;
  }
  return "";
};

export const restaurantConfig = {
  name: "Dev Cafe",
  slug: "dev-cafe",
  description: "Vibrant dark-themed coffee & food experience",
  logoUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=100&auto=format&fit=crop",
  currency: "₹",

  // ─── QR Code Base URL ──────────────────────────────────────────────────────
  // Set this to your PUBLIC URL so QR codes work when scanned from phones.
  // Options:
  //   • Tunnelmole:  "https://abc123.tunnelmole.net"
  //   • ngrok:       "https://abc123.ngrok.io"
  //   • Local IP:    "http://192.168.1.xxx:5173"  (find with: ipconfig on Windows)
  //   • Leave ""     to auto-detect the base URL (domain + subdirectory path)
  qrBaseUrl: ""
};

// Auto-fill if empty
if (!restaurantConfig.qrBaseUrl) {
  restaurantConfig.qrBaseUrl = getAutoQrBaseUrl();
}

