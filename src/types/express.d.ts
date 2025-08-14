import { AuthUser } from './interfaces';
import { Server } from 'socket.io';
import SocketManager from '../socket/SocketManager';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      io?: Server;
      socketManager?: SocketManager;
    }
  }
}