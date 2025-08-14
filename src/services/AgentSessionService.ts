import { v4 as uuidv4 } from 'uuid';
import { Op, WhereOptions } from 'sequelize';
import { AgentSession, User, UserCompany, Company} from '../models';
import { AgentStatus } from '../types/enums';

export class AgentSessionService {
  async createSession(
    userId: number, 
    ipAddress: string, 
    userAgent: string,
    socketId?: string,
    companyId?: number, 
  ): Promise<{ session: AgentSession; session_id: string }>  {
    // End any existing sessions
    await this.endAllSessions(userId);

    const user = await User.findByPk(userId, {
      include: [{
        model: UserCompany,
        where: { is_active: true },
        include: [Company],
        required: false
      }]
    });
    
    if (!user) {
      throw new Error('User not found');
    }

        // Determine which company to use for the session
        let sessionCompanyId = companyId;

if (!sessionCompanyId && user.userCompanies && user.userCompanies.length > 0) {
      // Use default company or first available
      const defaultCompany = user.userCompanies.find(uc => uc.is_default);
      sessionCompanyId = defaultCompany?.company_id || user.userCompanies[0].company_id;
    }

    if (!sessionCompanyId) {
      throw new Error('No company available for session');
    }

    // Create new session
    const session = await AgentSession.create({
      user_id: userId,
      company_id: sessionCompanyId, // Use the determined company ID
      session_id: uuidv4(),
      status: AgentStatus.AVAILABLE,
      ip_address: ipAddress,
      user_agent: userAgent,
      socket_id: socketId
    } as any);

    return {
      session,
      session_id: session.session_id
    };
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
    // Find all active sessions for this user (across all companies)
    const activeSessions = await AgentSession.findAll({
      where: { 
        user_id: userId,
        ended_at: { [Op.is]: null }
      } as WhereOptions<AgentSession>
    });
    
    if (activeSessions.length > 0) {
      await AgentSession.update(
        { 
          ended_at: new Date(),
          is_online: false,
          status: AgentStatus.OFFLINE
        },
        { 
          where: { 
            id: activeSessions.map(s => s.id)
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
    // Get all active sessions for the company
    const activeSessions = await AgentSession.findAll({
      where: { 
        company_id: companyId,
        is_online: true,
        ended_at: { [Op.is]: null }
      } as WhereOptions<AgentSession>
    });

    const activeUserIds = activeSessions.map(s => s.user_id);

    if (activeUserIds.length === 0) {
      return [];
    }

    // Get the users for these sessions
    const users = await User.findAll({
      where: { 
        id: activeUserIds
      },
      include: [
        {
          model: UserCompany,
          where: { 
            company_id: companyId,
            is_active: true 
          },
          required: true
        },
        {
          model: AgentSession,
          where: { 
            is_online: true,
            ended_at: { [Op.is]: null },
            company_id: companyId
          } as WhereOptions<AgentSession>,
          required: false
        }
      ]
    });

    return users;
  }

  async getAgentMetrics(userId: number, companyId?: number, dateFrom?: Date, dateTo?: Date): Promise<any> {
    const where: any = { user_id: userId };
    
    // If companyId provided, filter by company
    if (companyId) {
      where.company_id = companyId;
    }
    
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
      total_talk_time: 0,
      by_company: {} as Record<number, any>
    };

    sessions.forEach(session => {
      const sessionDuration = session.ended_at
        ? (session.ended_at.getTime() - session.started_at.getTime()) / 1000
        : (new Date().getTime() - session.started_at.getTime()) / 1000;

      metrics.total_time_online += sessionDuration;
      metrics.total_break_time += session.total_break_time;
      metrics.total_calls_handled += session.calls_handled;
      metrics.total_talk_time += session.total_talk_time;

      // Group by company
      if (!metrics.by_company[session.company_id]) {
        metrics.by_company[session.company_id] = {
          sessions: 0,
          time_online: 0,
          calls_handled: 0,
          talk_time: 0
        };
      }
      
      metrics.by_company[session.company_id].sessions++;
      metrics.by_company[session.company_id].time_online += sessionDuration;
      metrics.by_company[session.company_id].calls_handled += session.calls_handled;
      metrics.by_company[session.company_id].talk_time += session.total_talk_time;
    });

    if (metrics.total_calls_handled > 0) {
      metrics.avg_handle_time = metrics.total_talk_time / metrics.total_calls_handled;
    }

    return metrics;
  }


  async handleCallCompleted(agentId: number, companyId: number, callDuration: number): Promise<void> {
    // Find active session for the agent in the specific company
    const activeSession = await AgentSession.findOne({
      where: { 
        user_id: agentId,
        company_id: companyId,
        ended_at: { [Op.is]: null }
      } as WhereOptions<AgentSession>
    });

    if (activeSession) {
      activeSession.calls_handled += 1;
      activeSession.total_talk_time += callDuration;
      activeSession.avg_handle_time = activeSession.total_talk_time / activeSession.calls_handled;
      await activeSession.save();
    }
  }
}

export default new AgentSessionService();