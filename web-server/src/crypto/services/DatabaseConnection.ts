/**
 * Mongoose Database Connection Service
 * Handles connection management using Mongoose ODM
 */

import mongoose from 'mongoose';
import logger from '../utils/logger';

class DatabaseConnection {
  private static isConnected = false;
  private static isConnecting = false;
  private static connectionPromise: Promise<void> | null = null;

  // MongoDB connection configuration
  private static readonly CONNECTION_STRING = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  private static readonly DATABASE_NAME = process.env.DATABASE_NAME || 'spikey_coins';
  private static readonly CONNECTION_OPTIONS = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4, skip trying IPv6
    dbName: process.env.DATABASE_NAME || 'spikey_coins',
  };

  /**
   * Initialize Mongoose connection
   */
  static async initialize(): Promise<void> {
    // Check if mongoose is already connected (e.g. by server.ts)
    if ((mongoose.connection.readyState as number) === 1) {
      this.isConnected = true;
      return;
    }

    if (this.isConnected && (mongoose.connection.readyState as number) === 1) {
      return;
    }

    // Return existing connection promise if initialization in progress
    if (this.isConnecting && this.connectionPromise) {
      logger.info('DatabaseConnection: Connection already in progress, waiting...');
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = this._doInitialize();

    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Internal method to perform the actual connection
   */
  private static async _doInitialize(): Promise<void> {
    try {
      logger.info(`DatabaseConnection: Connecting to MongoDB at ${this.CONNECTION_STRING}`);

      await mongoose.connect(this.CONNECTION_STRING, this.CONNECTION_OPTIONS);
      this.isConnected = true;

      logger.info(`DatabaseConnection: Successfully connected to database '${this.DATABASE_NAME}'`);

      // Set up connection event listeners
      mongoose.connection.on('error', (error) => {
        logger.error('DatabaseConnection: Mongoose connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('DatabaseConnection: Mongoose disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('DatabaseConnection: Mongoose reconnected');
        this.isConnected = true;
      });

    } catch (error) {
      logger.error('DatabaseConnection: Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Get mongoose connection
   */
  static getConnection() {
    if (!this.isConnected || (mongoose.connection.readyState as number) !== 1) {
      throw new Error('Database not connected. Call initialize() first.');
    }
    return mongoose.connection;
  }

  /**
   * Get native MongoDB database instance (for backward compatibility)
   */
  static getDatabase() {
    if (!this.isConnected || (mongoose.connection.readyState as number) !== 1) {
      throw new Error('Database not connected. Call initialize() first.');
    }
    return mongoose.connection.db;
  }

  /**
   * Get connection status
   */
  static isConnectionReady(): boolean {
    return this.isConnected && (mongoose.connection.readyState as number) === 1;
  }

  /**
   * Get connection info
   */
  static getConnectionInfo(): any {
    return {
      isConnected: this.isConnected,
      databaseName: this.DATABASE_NAME,
      connectionString: this.CONNECTION_STRING.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
      readyState: mongoose.connection.readyState,
    };
  }

  /**
   * Close database connection
   */
  static async cleanup(): Promise<void> {
    if ((mongoose.connection.readyState as number) !== 0) {
      try {
        await mongoose.disconnect();
        logger.info('DatabaseConnection: Mongoose connection closed');
      } catch (error) {
        logger.error('DatabaseConnection: Error closing connection:', error);
      } finally {
        this.isConnected = false;
      }
    }
  }
}

export default DatabaseConnection;