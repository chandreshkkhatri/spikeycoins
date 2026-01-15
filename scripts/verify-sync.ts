
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../web-server/.env') });

async function runsync() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/openmandi');
  console.log('Connected.');

  console.log('Importing CoinGeckoSyncService...');
  // We need to use dynamic import or require because of how ts-node might handle imports relative to the script location
  // But easier to just copy the minimal logic here to test connectivity to CoinGecko
  
  const axios = require('axios');
  
  console.log('Testing CoinGecko API...');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 5, // Just get 5 for testing
        page: 1,
        sparkline: false,
        price_change_percentage: '24h',
      },
      timeout: 10000
    });
    
    console.log(`API Success! Got ${response.data.length} coins.`);
    console.log('First coin:', response.data[0].symbol, response.data[0].market_cap);
    
    // Now verify we can write to DB
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');
    
    const collection = db.collection('binance_coingecko_matches');
    const coin = response.data[0];
    const binanceSymbol = coin.symbol.toUpperCase() + 'USDT';
    
    console.log(`Upserting ${binanceSymbol}...`);
    await collection.updateOne(
      { binanceSymbol },
      { $set: { 
        binanceSymbol,
        marketCap: coin.market_cap,
        lastUpdated: new Date()
      }},
      { upsert: true }
    );
    
    console.log('Upsert successful.');
    
    const count = await collection.countDocuments();
    console.log(`Total documents in collection: ${count}`);
    
  } catch (error: any) {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    await mongoose.disconnect();
  }
}

runsync();
