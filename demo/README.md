# DiningOS Multi-Tenant Point of Sale (POS)

A multi-tenant Restaurant Point of Sale platform optimized for Indian restaurants. It supports QR code generation per table, digital menus, real-time order routing via WebSockets, and a visual table layout control.

---

## Prerequisites

1. **Node.js** (v18 or higher recommended)
2. **PostgreSQL** (running locally on port `5432` with the database `restaurant_os` created)

---

## 1. Running the Backend Server

The backend runs an Express API server with Socket.io WebSocket support.

1. Open a terminal and navigate to the `backend/` folder:
   ```bash
   cd backend
   ```
2. Verify that the `.env` file exists with the correct database connection URL:
   ```env
   PORT=5000
   DATABASE_URL=postgresql://postgres:Dev@nsh@3008@localhost:5432/restaurant_os
   JWT_SECRET=f9a8d7c6b5a43210efcdab8967452301fedcba9876543210
   JWT_REFRESH_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef
   NODE_ENV=development
   ```
3. Start the development server (runs on port `5000` with hot-reloading enabled):
   ```bash
   npm run dev
   ```

To run the integration and data isolation tests:
```bash
npm run test
```

---

## 2. Running the Frontend client

The frontend runs a mobile-responsive Vite React single-page application.

1. Open a separate terminal and navigate to the `frontend/` folder:
   ```bash
   cd frontend
   ```
2. Start the Vite React development server (runs on port `5173` by default):
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to:
   * **Terminal/POS Portal:** [http://localhost:5173](http://localhost:5173) (Access registration at `/register` or login at `/login`)
   * **Customer Table Menu:** [http://localhost:5173/r/spice-garden/table/table-id-here](http://localhost:5173/r/spice-garden/table/table-id-here) (Simulates scanning table QR code)
