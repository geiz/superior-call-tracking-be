import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User, AgentSession, UserCompany } from '../models';
import { AgentStatus, UserRole } from '../types/enums';
import AgentSessionService from '../services/AgentSessionService';

class AgentController {
  async getActiveAgents(req: AuthRequest, res: Response): Promise<void> {
    try {
      const agents = await AgentSessionService.getActiveAgents(req.user!.company_id);

      res.json(agents.map(agent => ({
        id: agent.id,
        email: agent.email,
        full_name: agent.full_name,
        status: agent.sessions[0]?.status,
        current_call_id: agent.sessions[0]?.current_call_id,
        calls_handled: agent.sessions[0]?.calls_handled,
        last_activity: agent.sessions[0]?.last_activity
      })));
    } catch (error) {
      console.error('Error fetching active agents:', error);
      res.status(500).json({ error: 'Failed to fetch active agents' });
    }
  }

  async getAgentMetrics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { date_from, date_to, company_id } = req.query;

      // Use current company if not specified
      const targetCompanyId = company_id ? parseInt(company_id as string) : req.user!.company_id;

      // Check if user has access to this company
      if (req.user!.role !== UserRole.ADMIN && targetCompanyId !== req.user!.company_id) {
        res.status(403).json({ error: 'Access denied to this company' });
        return;
      }

      const metrics = await AgentSessionService.getAgentMetrics(
        parseInt(id),
        targetCompanyId || undefined,
        date_from ? new Date(date_from as string) : undefined,
        date_to ? new Date(date_to as string) : undefined
      );

      res.json(metrics);
    } catch (error) {
      console.error('Error fetching agent metrics:', error);
      res.status(500).json({ error: 'Failed to fetch agent metrics' });
    }
  }

  async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, break_reason } = req.body;
      const sessionId = req.user?.session_id;

      if (!sessionId) {
        res.status(400).json({ error: 'No active session' });
        return;
      }

      await AgentSessionService.setAgentStatus(
        sessionId,
        status as AgentStatus,
        break_reason
      );

      // Emit status update to other users
      req.socketManager?.emitToCompany(
        req.user!.company_id,
        'agent:status:updated',
        {
          agent_id: req.user!.id,
          status,
          timestamp: new Date()
        }
      );

      res.json({ message: 'Status updated successfully' });
    } catch (error) {
      console.error('Error updating agent status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async getSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { date_from, date_to, limit = 50 } = req.query;

      const where: any = { user_id: parseInt(id) };

      if (date_from || date_to) {
        where.started_at = {};
        if (date_from) where.started_at.$gte = new Date(date_from as string);
        if (date_to) where.started_at.$lte = new Date(date_to as string);
      }

      const sessions = await AgentSession.findAll({
        where,
        order: [['started_at', 'DESC']],
        limit: parseInt(limit as string)
      });

      res.json(sessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  }

  async getAgentStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { date_from, date_to } = req.query;

      const where: any = { company_id: req.user!.company_id };

      if (date_from || date_to) {
        where.started_at = {};
        if (date_from) where.started_at.$gte = new Date(date_from as string);
        if (date_to) where.started_at.$lte = new Date(date_to as string);
      }

      // Get all agent sessions for the company
      const sessions = await AgentSession.findAll({
        where,
        include: [{
          model: User,
          include: [{
            model: UserCompany,
            where: { company_id: req.user!.company_id },
            required: true
          }]
        }]
      });

      // Aggregate stats by agent
      const agentStats = new Map();

      sessions.forEach(session => {
        const agentId = session.user_id;
        if (!agentStats.has(agentId)) {
          agentStats.set(agentId, {
            agent: session.user,
            role: session.user.userCompanies[0]?.role,
            total_sessions: 0,
            total_time_online: 0,
            total_calls_handled: 0,
            total_talk_time: 0,
            avg_handle_time: 0
          });
        }

        const stats = agentStats.get(agentId);
        stats.total_sessions += 1;
        stats.total_calls_handled += session.calls_handled;
        stats.total_talk_time += session.total_talk_time;

        const sessionDuration = session.ended_at
          ? (session.ended_at.getTime() - session.started_at.getTime()) / 1000
          : 0;
        stats.total_time_online += sessionDuration;
      });

      // Calculate averages
      const results = Array.from(agentStats.values()).map(stats => {
        if (stats.total_calls_handled > 0) {
          stats.avg_handle_time = stats.total_talk_time / stats.total_calls_handled;
        }
        return stats;
      });

      res.json(results);
    } catch (error) {
      console.error('Error fetching agent stats:', error);
      res.status(500).json({ error: 'Failed to fetch agent stats' });
    }
  }
}

export default new AgentController();