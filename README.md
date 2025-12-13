# Open Mandi - Unified Trading Platform

Open Mandi is a comprehensive trading platform that unifies multiple brokerage accounts into a single, modern interface. It supports trading on **Zerodha Kite**, **Upstox**, and **Binance**, allowing users to manage positions, orders, and watchlists across different brokers from one dashboard.

## 🚀 Project Structure

The project is organized as a monorepo with two main components:

- **`vite-ui/`**: The Frontend application built with React, Vite, TypeScript, and Tailwind CSS.
- **`web-server/`**: The Backend REST API built with Express, Node.js, TypeScript, and MongoDB.

## ✨ Features

- **Multi-Broker Support**: Connect and trade with Kite, Upstox, and Binance accounts simultaneously.
- **Unified Dashboard**: View total portfolio value, combined positions, and active orders in one place.
- **Real-time Trading**: Fast order execution and real-time price updates.
- **Advanced Charting**: Integrated TradingView Lightweight Charts for technical analysis.
- **Risk Management**: Built-in tools for position sizing and risk calculation.
- **Secure**: API keys are encrypted and stored securely.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **State Management**: React Context API
- **Charts**: Lightweight Charts

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB (Mongoose)
- **Broker SDKs**: Kite Connect, Upstox JS SDK, Binance API

## 📋 Prerequisites

Before running the project, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/) (Local instance or Atlas URI)

## 🚀 Getting Started

### 1. Backend Setup

Navigate to the backend directory and install dependencies:

```bash
cd web-server
npm install
```

Create a `.env` file based on the example:

```bash
cp .env.example .env
```

Update the `.env` file with your MongoDB connection string and other secrets.

Start the backend server:

```bash
npm run dev
```
The server will start on `http://localhost:8000` (default).

### 2. Frontend Setup

Open a new terminal, navigate to the frontend directory, and install dependencies:

```bash
cd vite-ui
npm install
```

Create a `.env` file:

```bash
cp .env.example .env
```

Ensure `VITE_API_URL` points to your backend (e.g., `http://localhost:8000`).

Start the frontend development server:

```bash
npm run dev
```
The application will be available at `http://localhost:5173` (default).

## 📄 License

This project is licensed under the ISC License.
