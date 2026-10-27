import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export async function connectDB() {
  if (!env.MONGODB_URI) {
    isConnected = false;
    logger.warn('MONGODB_URI is not set. Server will operate in in-memory mode without durable persistence.');
    return;
  }

  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connected successfully');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      logger.info('MongoDB reconnected successfully');
    });

    mongoose.connection.on('error', (err) => {
      isConnected = false;
      logger.error({ error: err.message }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
  } catch (error) {
    isConnected = false;
    logger.warn(
      { error: error.message },
      'MongoDB initial connection failed. Server will continue running in in-memory mode.'
    );
  }
}

export function getDBStatus() {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return {
    state: states[state] || 'unknown',
    isConnected: state === 1
  };
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  }
}
