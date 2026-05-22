# Barcode Billing Software

A full-featured barcode billing application with product and customer management, point-of-sale billing (scan or manual), invoices, and sales reports. Supports barcode generation for product labels and runs as both a **web app** and **desktop app** (Electron).

## Features

- **Products**: Add/edit/delete products with barcode, name, price, optional opening stock, reorder level, and cost price. Generate barcode and print labels.
- **Inventory**: Receive stock, adjust quantities, view movement history (what was added/sold and when), current stock levels, and low-stock alerts.
- **Customers**: Manage customers (name, phone, email, address).
- **Billing**: Scan barcode (camera or USB scanner) or enter manually; add to cart with stock checks; optional customer; complete sale and create invoice (stock deducted automatically).
- **Invoices**: List and filter by date; view and print invoice details.
- **Reports**: Sales summary and inventory summary by date range; export to CSV.

## Prerequisites

- **Node.js** 18+
- **MongoDB** running locally (e.g. `mongodb://127.0.0.1:27017`) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and set `MONGODB_URI`.

## Quick start (web)

1. Install dependencies (from project root):
  ```bash
   npm run postinstall
  ```
2. Start MongoDB if not already running.
3. Start backend and frontend:
  ```bash
   npm run dev
  ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser. The backend API runs at [http://localhost:3001](http://localhost:3001).

## Desktop (Electron)

- **Dev**: Run `npm run dev`, then in another terminal run `npm run electron`. The Electron window will load the Vite dev server (port 5173).
- **Production**: Build frontend and backend, then run Electron with the backend serving the app:
  ```bash
  npm run build
  NODE_ENV=production npm run electron
  ```
  (Electron will start the backend and open http://localhost:3001.)

## Environment

- `MONGODB_URI` – MongoDB connection string (default: `mongodb://127.0.0.1:27017/barcode-billing`)
- `PORT` – Backend port (default: 3001)

## Project structure

- `backend/` – Node + Express + MongoDB API (products, inventory/stock movements, customers, invoices, reports, barcode image)

## Inventory API (authenticated)

- `GET /api/inventory/movements` – Stock ledger (filter by product, date, type)
- `POST /api/inventory/stock-in` – Record received stock
- `POST /api/inventory/adjust` – Manual stock adjustment (+/−)
- `GET /api/inventory/summary` – Current stock snapshot
- `GET /api/inventory/low-stock` – Products at or below reorder level
- `GET /api/reports/inventory` – Inventory report for Reports page

Products accept optional `openingQuantity` on create. Invoices deduct stock atomically; overselling is blocked.
- `frontend/` – React + Vite + Tailwind UI
- `electron/` – Electron main process (starts backend and loads app)

## License

Aniket Khillare