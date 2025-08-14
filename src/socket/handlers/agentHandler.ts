import { Socket } from 'socket.io';
import AgentSessionService from '../../services/AgentSessionService';
import { AgentStatus } from '../../types/enums';

export const handleAgentEvents = (socket: Socket, sessionId: string) => {
  // Update agent status
  socket.on('agent:status', async (data: { status: AgentStatus; reason?: string }) => {
    try {
      await AgentSessionService.setAgentStatus(sessionId, data.status, data.reason);
      
      const socketData = socket.data as any;
      
      // Notify other agents in the company
      socket.to(`company:${socketData.companyId}`).emit('agent:status:changed', {
        agent_id: socketData.userId,
        status: data.status,
        reason: data.reason,
        timestamp: new Date()
      });

      // Confirm to sender
      socket.emit('agent:status:updated', {
        status: data.status,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to update status' });
    }
  });

  // Heartbeat/Keep-alive
  socket.on('agent:ping', async () => {
    try {
      await AgentSessionService.updateActivity(sessionId);
      socket.emit('agent:pong', { timestamp: new Date() });
    } catch (error) {
      socket.emit('error', { message: 'Failed to update activity' });
    }
  });

  // Set availability
  socket.on('agent:availability', async (data: { available: boolean }) => {
    try {
      const status = data.available ? AgentStatus.AVAILABLE : AgentStatus.AWAY;
      await AgentSessionService.setAgentStatus(sessionId, status);
      
      socket.emit('agent:availability:updated', {
        available: data.available,
        status,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to update availability' });
    }
  });

  // Get agent stats
  socket.on('agent:stats:get', async () => {
    try {
      const socketData = socket.data as any;
      const metrics = await AgentSessionService.getAgentMetrics(socketData.userId);
      
      socket.emit('agent:stats', metrics);
    } catch (error) {
      socket.emit('error', { message: 'Failed to get agent stats' });
    }
  });
};