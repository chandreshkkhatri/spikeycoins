# Open Mandi - Vite Frontend

A modern, high-performance trading platform frontend built with React, TypeScript, and Vite.

## 🚀 Features

- **Modern React 18** with hooks and functional components
- **TypeScript** for type safety and better developer experience
- **Vite** for lightning-fast development and optimized production builds
- **React Router v6** for client-side routing
- **Tailwind CSS** for responsive, utility-first styling
- **Radix UI** for accessible, composable UI components
- **Context API** for global state management (Theme, Auth, Account)
- **Axios** for API communication with Express backend
- **Lightweight Charts** for trading chart visualization

## 📋 Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Express backend running on `http://localhost:8000`

## 🛠️ Installation

```bash
cd vite-ui
npm install
```

## ⚙️ Configuration

Create a `.env` file in the root of the `vite-ui` directory:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
VITE_API_URL=http://localhost:8000
```

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

The application will start on `http://localhost:3000`.

### Production Build

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
vite-ui/
├── public/                 # Static assets
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components
│   │   ├── layout/        # Layout components (Header, NavBar)
│   │   ├── accounts/      # Account management components
│   │   ├── holdings/      # Holdings components
│   │   ├── orders/        # Orders components
│   │   ├── positions/     # Positions components
│   │   ├── watchlist/     # Trading panel components
│   │   └── trading/       # Trading components
│   ├── lib/               # Utilities and contexts
│   │   ├── account-context.tsx
│   │   ├── auth-context.tsx
│   │   ├── theme-context.tsx
│   │   ├── constants.ts
│   │   └── utils.ts
│   ├── pages/             # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Accounts.tsx
│   │   ├── Holdings.tsx
│   │   ├── Orders.tsx
│   │   ├── Positions.tsx
│   │   ├── TradingPanel.tsx
│   │   └── Trading.tsx
│   ├── App.tsx            # Main app component with routing
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global styles
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## 🎨 Key Technologies

### Frontend Framework
- **React 18**: Modern React with hooks and concurrent features
- **TypeScript**: Static typing for better code quality
- **Vite**: Next-generation frontend tooling

### UI & Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Unstyled, accessible component primitives
- **Lucide React**: Beautiful, consistent icon set

### Routing
- **React Router v6**: Declarative routing for React

### State Management
- **Context API**: For global state (Theme, Auth, Account)
- **React Hooks**: For local component state

### Data Fetching
- **Axios**: Promise-based HTTP client
- **Session Storage**: For caching and offline support

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## 🌐 API Integration

The frontend communicates with the Express backend API running on port 8000. All API calls are proxied through Vite's dev server configuration.

### API Endpoints

- `/api/auth/*` - Authentication endpoints
- `/api/accounts/*` - Account management
- `/api/orders/*` - Order management
- `/api/positions/*` - Position tracking
- `/api/holdings/*` - Holdings management
- `/api/funds/*` - Funds/margin information
- `/api/watchlist/*` - Watchlist management
- `/api/historical-data/*` - Historical market data
- `/api/upstox/*` - Upstox-specific endpoints

## 🎯 Key Features

### Multi-Account Support
- Connect multiple trading accounts (Upstox, Kite, Binance)
- Switch between accounts seamlessly
- OAuth 2.0 authentication flow

### Real-time Trading Panel
- Live price updates
- Multi-timeframe charts
- Watchlist management

### Trading Dashboard
- View orders, positions, and holdings
- Unified trading interface
- Funds/margin tracking

### Theme Support
- Light/Dark mode toggle
- Persistent theme preference
- Smooth theme transitions

### Offline Mode
- Session-based caching
- Continue working without active connection
- Automatic background refresh

## 🚀 Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Deploy to Static Hosting

The built files can be deployed to any static hosting service:

- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy --prod`
- **GitHub Pages**: Configure in repository settings
- **AWS S3 + CloudFront**: Upload `dist/` folder

### Environment Variables

Remember to configure environment variables for production:

```env
VITE_API_URL=https://your-api-domain.com
```

## 🔐 Security Notes

- All sensitive credentials are stored securely in the backend
- OAuth tokens are never exposed to the frontend
- HTTPS is recommended for production deployments
- API calls use secure session cookies

## 📚 Learn More

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [React Router Documentation](https://reactrouter.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Radix UI Documentation](https://www.radix-ui.com/)

## 🐛 Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Edit vite.config.ts and change the port
server: {
  port: 3001, // or any other available port
}
```

### API Connection Issues

- Ensure the Express backend is running on port 8000
- Check `VITE_API_URL` in your `.env` file
- Verify CORS configuration in the backend

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check TypeScript errors: `npm run type-check`

## 📝 License

This project is proprietary and confidential.
