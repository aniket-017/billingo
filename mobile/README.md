# Barcode Billing — Mobile App

React Native mobile app (Expo) for store staff. Connects to the existing backend API for billing, products, invoices, customers, stock receive, and settings.

## Prerequisites

- Node.js 18+ (20.19+ recommended)
- [Expo Go](https://expo.dev/go) on your phone (same Wi‑Fi as your dev machine)
- Backend running on port **1975**

This app uses **Expo SDK 52**, which works with the current Expo Go app from the Play Store / App Store. If you see an SDK mismatch error, update Expo Go or ensure the project is on SDK 52 (`expo` ~52 in `package.json`).

## Setup

1. **Start the backend** (from project root):

   ```bash
   npm run backend
   ```

2. **Find your PC's LAN IP** (Windows):

   ```bash
   ipconfig
   ```

   Use the IPv4 address (e.g. `192.168.1.42`).

3. **Configure the mobile app**:

   ```bash
   cd mobile
   copy .env.example .env
   ```

   Edit `.env`:

   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.42:1975/api
   ```

   Replace `192.168.1.42` with your actual LAN IP. Do **not** use `localhost` — your phone cannot reach it.

4. **Install dependencies** (if not already):

   ```bash
   npm install
   ```

5. **Start Expo**:

   ```bash
   npx expo start
   ```

   Or from project root: `npm run mobile`

6. Scan the QR code with **Expo Go** on your phone.

## Troubleshooting

- **Network request failed** — Check that phone and PC are on the same Wi‑Fi, `.env` has the correct LAN IP, and the backend is running.
- **Windows Firewall** — Allow inbound connections on port 1975 if the app cannot reach the API.
- **Platform admin login** — Use the web admin panel; mobile is for store users only.

## Screens

| Tab | Features |
|-----|----------|
| **Sale** | Camera barcode scan, manual entry, cart, checkout, today's revenue |
| **Products** | Searchable catalog, tap for details |
| **Invoices** | Last 7 days, tap for line items |
| **Customers** | Search, add, edit |
| **More** | Today's sales stats, stock receive, business settings, sign out |

## Verification checklist

1. Sign in with a store user account
2. Scan a product barcode → item appears in cart
3. Complete sale → invoice shows in Invoices tab
4. Today's sales stat updates on Sale and More tabs
5. Add a customer → selectable at checkout
6. Stock receive increases product quantity
7. Update settings → reflected after save

## Project structure

```
mobile/
├── app/                 # Expo Router screens
├── src/
│   ├── api/client.ts    # API client (JWT + fetch)
│   ├── components/      # Shared UI
│   ├── contexts/        # Auth & settings
│   └── theme.ts         # Colors & typography
└── .env.example
```
