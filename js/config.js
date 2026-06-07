// RestaurantOS Serverless Settings & Customization
export const firebaseConfig = {
  apiKey: "AIzaSyDAQ97SW9nC_ptq8uM3zRYzsUNw0EK1ToY",
  authDomain: "restaurantos-9ab2a.firebaseapp.com",
  projectId: "restaurantos-9ab2a",
  storageBucket: "restaurantos-9ab2a.firebasestorage.app",
  messagingSenderId: "193027844222",
  appId: "1:193027844222:web:f237d98af4b6e7f4f2d02f"
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
  //   • Leave ""     to auto-use window.location.origin (only works on same device)
  qrBaseUrl: "https://unicornsgroup.github.io/restaurantos"
};
