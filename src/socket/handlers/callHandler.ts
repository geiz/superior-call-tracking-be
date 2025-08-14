import { Socket } from 'socket.io';
import { Call } from '../../models';
import { CallStatus } from '../../types/enums';

export const handleCallEvents = (socket: Socket) => {
  // Subscribe to call updates
  socket.on('call:subscribe', async (callId: string) => {
    socket.join(`call:${callId}`);
    socket.emit('call:subscribed', { callId });
  });

  // Unsubscribe from call updates
  socket.on('call:unsubscribe', (callId: string) => {
    socket.leave(`call:${callId}`);
    socket.emit('call:unsubscribed', { callId });
  });

  // Get call status
  socket.on('call:status:get', async (callId: number) => {
    try {
      const call = await Call.findByPk(callId);
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      socket.emit('call:status', {
        callId: call.id,
        status: call.status,
        duration: call.duration,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to get call status' });
    }
  });

  // Update call status (for testing/admin)
  socket.on('call:status:update', async (data: { callId: number; status: CallStatus }) => {
    try {
      const call = await Call.findByPk(data.callId);
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      await call.update({ status: data.status });
      
      // Notify all subscribers
      socket.to(`call:${call.id}`).emit('call:status:updated', {
        callId: call.id,
        status: data.status,
        timestamp: new Date()
      });

      socket.emit('call:status:updated', {
        callId: call.id,
        status: data.status,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to update call status' });
    }
  });
};