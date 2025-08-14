// backend/src/app.ts - Updated with proper CORS and CSP configuration
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { QueryTypes } from 'sequelize';

import type { Server as IOServer } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';

// Load environment variables
dotenv.config();

// Import configurations
import { appConfig } from './config/app';
import { sequelize } from './models';
import redisClient from './config/redis';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Import routes
import routes from './routes';

// Import socket manager
import SocketManager from './socket/SocketManager';
import { DniCleanupJob } from './jobs/dniCleanup';

process.env.TZ = 'America/New_York';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      io?: IOServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;
      socketManager?: SocketManager;
    }
  }
}

// Create Express app
const app: Express = express();
const server = http.createServer(app);

// Initialize Socket.io
const socketManager = new SocketManager(server);

// CORS Configuration - MUST be before other middleware
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      // Local development
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      
      // Firebase hosting
      'https://superior-call-track.web.app',
      'https://superior-call-track.firebaseapp.com',
      
      // ngrok URLs (add all your ngrok URLs)
      'https://f04de7477bc3.ngrok-free.app',
      'https://0c6f6b3d8a66.ngrok-free.app',
      'https://3b941be804d3.ngrok-free.app',
      'https://2b211813b378.ngrok-free.app',
      'https://e1686d38c0ea.ngrok-free.app ',
      
      // Environment variables
      process.env.BASE_URL,
      process.env.FRONTEND_URL,
      process.env.ALLOWED_ORIGINS // You can add comma-separated origins in .env
    ].filter(Boolean);

    // Also allow any additional origins from environment variable
    if (process.env.ALLOWED_ORIGINS) {
      const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      allowedOrigins.push(...envOrigins);
    }

    // For development, you might want to log what's happening
    if (process.env.NODE_ENV === 'development') {
      console.log('CORS Origin:', origin);
      console.log('Allowed:', allowedOrigins.includes(origin));
    }

    if (allowedOrigins.includes(origin) || origin.includes('ngrok') || origin.includes('firebase')) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Security headers with CSP - more permissive for cross-origin
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow eval for some libraries
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'", 
        "ws:", 
        "wss:", 
        "http://localhost:*", 
        "https://localhost:*",
        "https://*.ngrok-free.app",
        "https://*.firebaseapp.com",
        "https://*.web.app"
      ],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for cross-origin resources
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } // Allow popups
}));

// Additional headers for CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set additional CORS headers if needed
  const origin = req.headers.origin;
  if (origin && (origin.includes('firebase') || origin.includes('ngrok'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter);

// Make socket manager accessible to routes
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.io = socketManager.getIO();
  req.socketManager = socketManager;
  next();
});

// Static files
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await sequelize.authenticate();
    const redisStatus = redisClient.isReady;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redisStatus ? 'connected' : 'disconnected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to database
    console.log('🔄 Attempting to connect to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    // Connect to Redis
    await redisClient.connect();
    console.log('✅ Redis connected successfully');

    // Check if critical tables exist
    try {
      const result = await sequelize.query(
        `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name IN ('companies', 'users', 'calls', 'tracking_numbers')
     ORDER BY table_name`,
        { type: QueryTypes.SELECT }
      );

      console.log(`📊 Found ${result.length} critical tables`);

      if (result.length < 4) {
        console.log('⚠️  Some critical tables are missing. Run: npm run db:setup');
        console.log('Missing tables:', ['companies', 'users', 'calls', 'tracking_numbers'].filter(
          table => !result.some((r: any) => r.table_name === table)
        ));
        process.exit(1);
      }
    } catch (error) {
      console.log('⚠️  Error checking database tables:', error);
      console.log('📌 Continuing anyway...');
    }

    server.listen(PORT, () => {
      console.log(`🚀 CRC Backend running on port ${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Database: ${process.env.DB_HOST}`);
      console.log(`📊 Database: ${process.env.DB_NAME}`);
      console.log(`🌐 CORS: Firebase and ngrok origins enabled`);

      DniCleanupJob.start();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// cleanup on process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  DniCleanupJob.stop();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  DniCleanupJob.stop();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export { app, server };