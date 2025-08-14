import { v4 as uuidv4 } from 'uuid';
import { Op, WhereOptions } from 'sequelize';
import { AgentSession, User } from '../models';
import { AgentStatus } from '../types/enums';

export class AgentSessionService {
  async createSession(
    userId: number, 
    ipAddress: string, 
    userAgent: string,
    socketId?: string
  ): Promise<AgentSession> {
    // End any existing sessions
    await this.endAllSessions(userId);

    // Get user to ensure we have company_id
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create new session
    const session = await AgentSession.create({
      user_id: userId,
      company_id: user.company_id,
      session_id: uuidv4(),
      status: AgentStatus.AVAILABLE,
      ip_address: ipAddress,
      user_agent: userAgent,
      socket_id: socketId
    } as any);

    return session;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await AgentSession.findOne({
      where: { 
        session_id: sessionId
      } as WhereOptions<AgentSession>
    });

    if (session && !session.ended_at) {
      await session.endSession();
    }
  }

  async endAllSessions(userId: number): Promise<void> {
    // Find all active sessions and end them
    const activeSessions = await AgentSession.findAll({
      where: { 
        user_id: userId
      } as WhereOptions<AgentSession>
    });

    // Filter for sessions that haven't ended
    const sessionsToEnd = activeSessions.filter(s => !s.ended_at);
    
    if (sessionsToEnd.length > 0) {
      await AgentSession.update(
        { 
          ended_at: new Date(),
          is_online: false,
          status: AgentStatus.OFFLINE
        },
        { 
          where: { 
            id: sessionsToEnd.map(s => s.id)
          } as WhereOptions<AgentSession>
        }
      );
    }
  }

  async updateActivity(sessionId: string): Promise<void> {
    const session = await AgentSession.findOne({
      where: { 
        session_id: sessionId
      } as WhereOptions<AgentSession>
    });

    if (session && !session.ended_at) {
      await session.updateActivity();
    }
  }

  async updateSocketId(sessionId: string, socketId: string): Promise<void> {
    // First find the active session
    const session = await AgentSession.findOne({
      where: { 
        session_id: sessionId
      } as WhereOptions<AgentSession>
    });

    if (session && !session.ended_at) {
      await session.update({ socket_id: socketId });
    }
  }

  async setAgentStatus(
    sessionId: string, 
    status: AgentStatus, 
    breakReason?: string
  ): Promise<void> {
    const session = await AgentSession.findOne({
      where: { 
        session_id: sessionId
      } as WhereOptions<AgentSession>
    });

    if (session && !session.ended_at) {
      if (breakReason) {
        session.break_reason = breakReason;
      }
      await session.setStatus(status);
    }
  }

  async getActiveAgents(companyId: number): Promise<User[]> {
    // First get all sessions for the company that are online
    const activeSessions = await AgentSession.findAll({
      where: { 
        company_id: companyId,
        is_online: true
      } as WhereOptions<AgentSession>
    });

    // Filter for sessions that haven't ended
    const activeSessionUserIds = activeSessions
      .filter(s => !s.ended_at)
      .map(s => s.user_id);

    if (activeSessionUserIds.length === 0) {
      return [];
    }

    // Get the users for these sessions
    const users = await User.findAll({
      where: { 
        id: activeSessionUserIds,
        company_id: companyId 
      },
      include: [{
        model: AgentSession,
        where: { 
          is_online: true 
        } as WhereOptions<AgentSession>,
        required: false
      }]
    });

    return users;
  }

  async getAgentMetrics(userId: number, dateFrom?: Date, dateTo?: Date): Promise<any> {
    const where: any = { user_id: userId };
    
    if (dateFrom || dateTo) {
      where.started_at = {};
      if (dateFrom) where.started_at[Op.gte] = dateFrom;
      if (dateTo) where.started_at[Op.lte] = dateTo;
    }

    const sessions = await AgentSession.findAll({ where });

    const metrics = {
      total_sessions: sessions.length,
      total_time_online: 0,
      total_break_time: 0,
      total_calls_handled: 0,
      avg_handle_time: 0,
      total_talk_time: 0
    };

    sessions.forEach(session => {
      const sessionDuration = session.ended_at
        ? (session.ended_at.getTime() - session.started_at.getTime()) / 1000
        : (new Date().getTime() - session.started_at.getTime()) / 1000;

      metrics.total_time_online += sessionDuration;
      metrics.total_break_time += session.total_break_time;
      metrics.total_calls_handled += session.calls_handled;
      metrics.total_talk_time += session.total_talk_time;
    });

    if (metrics.total_calls_handled > 0) {
      metrics.avg_handle_time = metrics.total_talk_time / metrics.total_calls_handled;
    }

    return metrics;
  }

  async handleCallCompleted(agentId: number, callDuration: number): Promise<void> {
    // Find active session for the agent
    const sessions = await AgentSession.findAll({
      where: { 
        user_id: agentId
      } as WhereOptions<AgentSession>
    });

    // Find the first session that hasn't ended
    const activeSession = sessions.find(s => !s.ended_at);

    if (activeSession) {
      activeSession.calls_handled += 1;
      activeSession.total_talk_time += callDuration;
      activeSession.avg_handle_time = activeSession.total_talk_time / activeSession.calls_handled;
      await activeSession.save();
    }
  }
}

export default new AgentSessionService();