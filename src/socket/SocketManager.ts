import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import AgentSessionService from '../services/AgentSessionService';
import { AgentStatus } from '../types/enums';
import { handleCallEvents } from './handlers/callHandler';
import { handleAgentEvents } from './handlers/agentHandler';
import { verifyToken } from '../config/jwt';

interface SocketData {
  userId: number;
  companyId: number;
  role: string;
  sessionId?: string;
}

export class SocketManager {
  private io: Server;

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = verifyToken(token) as any;

        socket.data = {
          userId: decoded.id,
          companyId: decoded.company_id,
          role: decoded.role,
          sessionId: decoded.session_id
        } as SocketData;

        // Update agent session with socket ID if applicable
        if (decoded.session_id) {
          await AgentSessionService.updateSocketId(decoded.session_id, socket.id);
        }

        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      const { userId, companyId, role, sessionId } = socket.data as SocketData;
      
      console.log(`User ${userId} connected (Socket: ${socket.id})`);

      // Join company room
      socket.join(`company:${companyId}`);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Set up call event handlers
      handleCallEvents(socket);

      // Agent-specific events
      if (role === 'agent' && sessionId) {
        handleAgentEvents(socket, sessionId);
      }

      // Common events
      socket.on('join:room', (room: string) => {
        socket.join(room);
      });

      socket.on('leave:room', (room: string) => {
        socket.leave(room);
      });

      socket.on('disconnect', async () => {
        console.log(`User ${userId} disconnected`);
        
        // End agent session on disconnect
        if (sessionId) {
          await AgentSessionService.endSession(sessionId);
        }
      });
    });
  }

  getIO(): Server {
    return this.io;
  }

  // Utility methods for emitting events
  emitToCompany(companyId: number, event: string, data: any): void {
    this.io.to(`company:${companyId}`).emit(event, data);
  }

  emitToUser(userId: number, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  emitToCall(callId: string, event: string, data: any): void {
    this.io.to(`call:${callId}`).emit(event, data);
  }

  emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }
}

export default SocketManager;