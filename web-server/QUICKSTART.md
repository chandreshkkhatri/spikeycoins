# Quick Start Guide - Spikey Coins Express Backend

## 1. Install Dependencies

```bash
cd /home/chandresh/code/spikey-coins/web-server
npm install
```

## 2. Configure Environment

Create a `.env` file in the web-server directory:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/spikey-coins
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
SESSION_SECRET=your-random-secret-key
BASE_URL=http://localhost:8000
```

## 3. Ensure MongoDB is Running

Make sure MongoDB is running on your system:

```bash
# Ubuntu/Debian
sudo systemctl start mongod

# macOS (with Homebrew)
brew services start mongodb-community

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

## 4. Start the Development Server

```bash
npm run dev
```

The server should start on `http://localhost:8000`

## 5. Test the API

### Health Check

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### Get Accounts (empty initially)

```bash
curl "http://localhost:8000/api/accounts?userId=default_user"
```

Expected response:

```json
{
  "success": true,
  "accounts": []
}
```

### Create an Account

```bash
curl -X POST http://localhost:8000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "default_user",
    "accountType": "kite",
    "accountName": "My Kite Account",
    "apiKey": "your_api_key",
    "apiSecret": "your_api_secret"
  }'
```

## 6. Common Issues

### MongoDB Connection Error

If you see `Failed to connect to MongoDB`, ensure:

- MongoDB is running
- Connection string in `.env` is correct
- MongoDB is accessible on the specified port

### Port Already in Use

If port 8000 is busy:

- Change `PORT` in `.env` to another port (e.g., 3002)
- Or kill the process using the port:
  ```bash
  # Find process
  lsof -i :8000
  # Kill it
  kill -9 <PID>
  ```

### CORS Errors

If you get CORS errors from the frontend:

- Ensure the frontend URL is in `ALLOWED_ORIGINS` in `.env`
- Restart the Express server after changing `.env`

## 7. Development Workflow

1. Make changes to files in `src/`
2. Server automatically reloads (ts-node-dev)
3. Check terminal for errors
4. Test API endpoints
5. Repeat

## 8. Project Structure Overview

```
web-server/
├── src/
│   ├── server.ts          # Main entry point
│   ├── lib/               # Services and utilities
│   ├── models/            # MongoDB models
│   └── routes/            # API endpoints
├── package.json
├── tsconfig.json
├── .env                   # Your local config (not in git)
└── README.md
```

## 9. Next Steps

- Configure your trading accounts via the API
- Test authentication flows for Kite/Upstox
- See the [Architecture guide](../docs/ARCHITECTURE.md) to understand the system design
- Check the [Contributing guidelines](../CONTRIBUTING.md) for development workflow

## 10. Useful Commands

```bash
# Type check without running
npm run type-check

# Build for production
npm run build

# Run production build
npm start

# Debug mode
npm run start:debug

# Lint code
npm run lint
npm run lint:fix
```

## Support

Check the main README.md for detailed API documentation and troubleshooting tips.
