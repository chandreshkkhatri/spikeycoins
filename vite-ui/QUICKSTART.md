# Open Mandi Vite Frontend - Quick Start Guide

Get up and running with the Open Mandi frontend in minutes!

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```bash
cd vite-ui
npm install
```

This will install all required dependencies including React, Vite, TypeScript, and UI libraries.

### Step 2: Configure Environment

Create your environment configuration:

```bash
cp .env.example .env
```

Edit `.env` with your backend URL (default is already correct for local development):

```env
VITE_API_URL=http://localhost:8000
```

### Step 3: Start the Development Server

```bash
npm run dev
```

The frontend will start on **http://localhost:3000**

### Step 4: Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

You should see the Open Mandi dashboard!

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- ✅ Node.js v18+ installed (`node --version`)
- ✅ npm or yarn installed (`npm --version`)
- ✅ Express backend running on port 8000
- ✅ MongoDB running (for the backend)

## 🔗 Backend Connection

The frontend expects the Express backend to be running on port 8000. Make sure you've started the backend first:

```bash
# In a separate terminal, navigate to web-server directory
cd ../web-server
npm run dev
```

The backend should show:

```
✅ MongoDB connected successfully
🚀 Server running on http://localhost:8000
```

## 🧪 Testing the Setup

### 1. Check the Dashboard

Navigate to `http://localhost:3000` - you should see:
- Trading Dashboard title
- Navigation menu
- Feature cards for Market Watch, Orders, Positions, etc.

### 2. Test Navigation

Click on different menu items:
- **Dashboard**: Main overview
- **Accounts**: Manage trading accounts
- **Market Watch**: View watchlists
- **Orders**: View and manage orders
- **Positions**: Track positions
- **Holdings**: View holdings

### 3. Test Theme Toggle

- Click the theme toggle button in the header
- Theme should switch between light and dark mode
- Preference should persist after page reload

### 4. Test Account Management

1. Navigate to **Accounts** page
2. Click **"+ Add Account"**
3. Fill in account details (use sandbox credentials for testing)
4. Verify the account appears in the list

## 🎨 Development Workflow

### Hot Module Replacement (HMR)

Vite provides instant HMR - any changes you make to the code will reflect immediately in the browser without a full page reload.

Try it:
1. Open `src/pages/Dashboard.tsx`
2. Change the dashboard title text
3. Save the file
4. See the change instantly in the browser!

### Code Organization

```
src/
├── components/     # Reusable components
├── pages/          # Page components (routed)
├── lib/            # Utilities, contexts, constants
├── App.tsx         # Main app with routing
└── main.tsx        # Entry point
```

### Adding a New Page

1. Create a new file in `src/pages/`, e.g., `NewPage.tsx`
2. Add the route in `src/App.tsx`
3. Add navigation link in `src/components/layout/Header.tsx`

Example:

```typescript
// src/pages/NewPage.tsx
import PageLayout from '@/components/layout/PageLayout';

export default function NewPage() {
  return (
    <PageLayout title="New Page">
      <h1>Welcome to the new page!</h1>
    </PageLayout>
  );
}

// src/App.tsx
import NewPage from '@/pages/NewPage';

// Add to routes:
<Route path="/new-page" element={<NewPage />} />
```

## 🔧 Common Development Tasks

### Check for Errors

```bash
# TypeScript type checking
npm run type-check

# Linting
npm run lint
```

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run build
npm run preview
```

This serves the production build locally for testing.

## 🐛 Common Issues & Solutions

### Issue: "Cannot GET /" - Blank Page

**Solution**: Make sure you're accessing `http://localhost:3000`, not a different port.

### Issue: API calls failing with CORS errors

**Cause**: Backend not running or CORS not configured properly.

**Solution**:
1. Verify backend is running: `curl http://localhost:8000/api/auth/status`
2. Check backend CORS configuration in `web-server/src/server.ts`
3. Ensure `VITE_API_URL` is set correctly in `.env`

### Issue: Components not rendering

**Cause**: Missing imports or path resolution issues.

**Solution**:
1. Check that paths use `@/` alias (configured in `vite.config.ts`)
2. Verify import statements are correct
3. Run `npm run type-check` to find type errors

### Issue: Styles not applying

**Cause**: Tailwind CSS not loaded or PostCSS configuration issue.

**Solution**:
1. Verify `index.css` is imported in `main.tsx`
2. Check `tailwind.config.js` is properly configured
3. Clear Vite cache: `rm -rf node_modules/.vite` and restart

### Issue: Port 3000 already in use

**Solution**: Change the port in `vite.config.ts`:

```typescript
export default defineConfig({
  server: {
    port: 3001, // Change to any available port
  },
});
```

### Issue: Environment variables not working

**Cause**: Vite requires `VITE_` prefix for env vars.

**Solution**: Ensure all environment variables start with `VITE_`:

```env
# ❌ Wrong
API_URL=http://localhost:8000

# ✅ Correct
VITE_API_URL=http://localhost:8000
```

Access in code: `import.meta.env.VITE_API_URL`

## 📚 Next Steps

### Explore the Codebase

1. **Contexts**: `src/lib/*-context.tsx` - Global state management
2. **Components**: `src/components/` - Reusable UI components
3. **Pages**: `src/pages/` - Route-level components
4. **Utilities**: `src/lib/utils.ts` and `src/lib/constants.ts`

### Customize the UI

1. **Theme Colors**: Edit `tailwind.config.js`
2. **Global Styles**: Edit `src/index.css`
3. **Layout**: Modify `src/components/layout/`

### Add Features

1. Study existing components for patterns
2. Use the Context API for global state
3. Follow the established component structure
4. Leverage Radix UI for accessible components

## 🎯 Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run type-check       # Check TypeScript types
npm run lint            # Run ESLint

# Production
npm run build           # Build for production
npm run preview         # Preview production build

# Maintenance
rm -rf node_modules/.vite  # Clear Vite cache
npm ci                  # Clean install dependencies
```

## 🌐 API Integration

The frontend uses Axios for API calls. All endpoints are defined in `src/lib/constants.ts`.

Example API call:

```typescript
import axios from 'axios';
import { API_ROUTES } from '@/lib/constants';

const response = await axios.get(API_ROUTES.accounts.list);
```

The Vite dev server automatically proxies `/api/*` requests to the backend.

## 💡 Pro Tips

1. **Use React DevTools**: Install the React DevTools browser extension for debugging
2. **Leverage HMR**: Keep the dev server running while coding for instant feedback
3. **Type Safety**: Let TypeScript guide you - pay attention to type errors
4. **Component Isolation**: Test components individually before integrating
5. **Consistent Patterns**: Follow existing code patterns for consistency

## 📞 Support

If you encounter issues:

1. Check this QUICKSTART guide
2. Review the main README.md
3. Inspect browser console for errors
4. Check network tab for failed API calls
5. Verify backend logs for API errors

## 🎉 You're All Set!

You now have a fully functional Open Mandi frontend running locally. Happy coding! 🚀
