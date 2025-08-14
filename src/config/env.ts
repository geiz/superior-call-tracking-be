// backend/src/config/env.ts
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables once
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error && process.env.NODE_ENV !== 'production') {
  console.warn('Warning: .env file not found or could not be loaded');
  console.warn('Path tried:', envPath);
}

// Export a function to validate required env vars
export function validateEnv(required: string[]): void {
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   ${key}: Not set`);
    });
    console.error('\nPlease check your .env file in the backend directory.');
    process.exit(1);
  }
}

// Export commonly used env vars with defaults
export const ENV = {
  // Server
  PORT: process.env.PORT || '3001',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  DB_HOST: process.env.DB_HOST!,
  DB_PORT: process.env.DB_PORT || '25060',
  DB_NAME: process.env.DB_NAME || 'crc_db',
  DB_USER: process.env.DB_USER!,
  DB_PASSWORD: process.env.DB_PASSWORD!,
  DB_SSL: process.env.DB_SSL === 'true',
  
  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID!,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN!,
  
  // URLs
  BASE_URL: process.env.BASE_URL || 'http://localhost:3001',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
};