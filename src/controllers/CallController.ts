import { CallDisposition } from '../types/enums';
import { Response } from 'express';
import { Op, QueryTypes, Sequelize } from 'sequelize';
import { AuthRequest } from '../middleware/auth';
import { Call, Tag, CallTag, CallRecording, TrackingNumber, Company, sequelize, Visitor } from '../models';
import { CallStatus } from '../types/enums';
import WebhookService from '../services/WebhookService';
import SipService from '../services/SipService';
import { StorageService } from '../services/StorageService';

import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';


// Helper function to convert dates to company timezone
const getDateRangeInTimezone = (dateFrom: string | undefined, dateTo: string | undefined, timezone: string = 'America/New_York') => {
  const result: any = {};

  if (dateFrom) {
    // Parse the date and set to start of day in the company's timezone
    const date = parseISO(dateFrom);
    const zonedDate = toZonedTime(date, timezone);
    result.from = startOfDay(zonedDate);
  }

  if (dateTo) {
    // Parse the date and set to end of day in the company's timezone
    const date = parseISO(dateTo);
    const zonedDate = toZonedTime(date, timezone);
    result.to = endOfDay(zonedDate);
  }

  return result;
};

class CallController {
  private storageService = new StorageService();

  async getCalls(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        status,
        date_from,
        date_to,
        tags,
        tracking_number_id,
        page = 1,
        limit = 50,
        sort_by = 'start_time',
        sort_order = 'DESC'
      } = req.query;

      // Get user's company for timezone
      const company = await Company.findByPk(req.user!.company_id);
      const timezone = company?.timezone || 'America/New_York';

      const where: any = {
        company_id: req.user!.company_id
      };

      // Apply filters
      if (status) where.status = status;
      if (tracking_number_id) where.tracking_number_id = tracking_number_id;

      // Handle date filters
      if (date_from || date_to) {
        where.start_time = {};

        if (date_from) {
          // Check if the date_from includes time, if not add start of day
          const fromDate = typeof date_from === 'string' && date_from.includes('T')
            ? new Date(date_from as string)
            : new Date(`${date_from}T00:00:00`);
          where.start_time[Op.gte] = fromDate;
        }

        if (date_to) {
          // Check if the date_to includes time, if not add end of day
          const toDate = typeof date_to === 'string' && date_to.includes('T')
            ? new Date(date_to as string)
            : new Date(`${date_to}T23:59:59`);
          where.start_time[Op.lte] = toDate;
        }
      }


      // Handle tag filtering differently
      let tagFilter = false;
      let tagIds: number[] = [];
      if (tags) {
        tagFilter = true;
        tagIds = Array.isArray(tags) ? tags.map(t => parseInt(t as string)) : [parseInt(tags as string)];
      }

      // Base include array without tag filter
      const include: any[] = [
        {
          model: CallRecording,
          required: false,
          attributes: ['id', 'file_url', 'duration', 'waveform_data']
        },
        {
          model: TrackingNumber,
          required: false,
          attributes: ['id', 'phone_number', 'friendly_name', 'source', 'campaign']
        }
      ];

      // Always include tags for display
      include.push({
        model: Tag,
        as: 'tags',
        through: { attributes: [] },
        required: false
      });

      // Pagination
      const offset = ((page as number) - 1) * (limit as number);

      try {
        let calls: Call[];
        let count: number;

        if (tagFilter) {
          // First get call IDs that have the specified tags
          const callsWithTags = await sequelize.query<{ call_id: number }>(
            `SELECT DISTINCT call_id 
           FROM call_tags 
           WHERE tag_id IN (:tagIds) 
           AND call_id IN (
             SELECT id FROM calls WHERE company_id = :companyId
           )`,
            {
              replacements: {
                tagIds,
                companyId: req.user!.company_id
              },
              type: QueryTypes.SELECT
            }
          );

          const callIds = callsWithTags.map(c => c.call_id);

          if (callIds.length === 0) {
            // No calls with those tags
            res.json({
              calls: [],
              pagination: {
                total: 0,
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                pages: 0
              }
            });
            return;
          }

          // Add call ID filter
          where.id = { [Op.in]: callIds };
        }

        // Now get the filtered calls
        const result = await Call.findAndCountAll({
          where,
          include,
          limit: parseInt(limit as string),
          offset,
          order: [[sort_by as string, sort_order as string]],
          distinct: true
        });

        calls = result.rows;
        count = result.count;

        res.json({
          calls,
          pagination: {
            total: count,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            pages: Math.ceil(count / (limit as number))
          }
        });
      } catch (error) {
        console.error('Database query error:', error);
        res.json({
          calls: [],
          pagination: {
            total: 0,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            pages: 0
          }
        });
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
      res.status(500).json({ error: 'Failed to fetch calls' });
    }
  }

  async getRecordingUrl(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { download } = req.query;

      // Find call with company validation
      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        },
        include: [
          {
            model: CallRecording,
            as: 'recording'
          }
        ]
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      // Check if recording exists
      const recording = call.recording;
      if (!recording || !recording.storage_key) {
        res.status(404).json({ error: 'No recording available for this call' });
        return;
      }

      // Generate appropriate URL based on download flag
      let signedUrl: string;
      if (download === 'true') {
        const filename = `call-${call.call_sid}-recording.mp3`;
        signedUrl = await this.storageService.getDownloadUrl(
          recording.storage_key,
          filename
        );
      } else {
        signedUrl = await this.storageService.getSignedUrl(
          recording.storage_key,
          3600 // 1 hour expiration
        );
      }

      res.json({
        url: signedUrl,
        expires_in: 3600,
        recording_id: recording.id,
        duration: recording.duration,
        format: recording.format
      });
    } catch (error) {
      console.error('Error getting recording URL:', error);
      res.status(500).json({ error: 'Failed to generate recording URL' });
    }
  }

  /**
   * Stream recording (alternative approach)
   */
  async streamRecording(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call || !call.recording_key) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // Get a signed URL for streaming
      const signedUrl = await this.storageService.getSignedUrl(call.recording_key, 300);

      // Redirect to the signed URL
      res.redirect(signedUrl);
    } catch (error) {
      console.error('Error streaming recording:', error);
      res.status(500).json({ error: 'Failed to stream recording' });
    }
  }

  /**
   * List calls with pagination
   */
  async listCalls(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        search,
        from_date,
        to_date,
        status,
        tag_ids,
        tracking_number_id
      } = req.query;

      const where: any = {
        company_id: req.user!.company_id
      };

      // Apply filters
      if (from_date || to_date) {
        where.start_time = {};
        if (from_date) where.start_time.$gte = new Date(from_date as string);
        if (to_date) where.start_time.$lte = new Date(to_date as string);
      }

      if (status) {
        where.status = status;
      }

      if (tracking_number_id) {
        where.tracking_number_id = tracking_number_id;
      }

      if (search) {
        where.$or = [
          { caller_number: { $like: `%${search}%` } },
          { to_number: { $like: `%${search}%` } },
          { '$tracking_number.friendly_name$': { $like: `%${search}%` } }
        ];
      }

      const calls = await Call.findAndCountAll({
        where,
        include: [
          {
            model: TrackingNumber,
            attributes: ['phone_number', 'friendly_name', 'source', 'medium', 'campaign']
          }
        ],
        order: [['start_time', 'DESC']],
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string)
      });

      res.json({
        calls: calls.rows,
        total: calls.count,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(calls.count / parseInt(limit as string))
      });
    } catch (error) {
      console.error('Error listing calls:', error);
      res.status(500).json({ error: 'Failed to list calls' });
    }
  }

  async getCallById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        },
        include: [
          {
            model: Tag,
            as: 'tags',
            through: { attributes: [] },
            required: false
          },
          {
            model: CallRecording,
            required: false
          },
          {
            model: TrackingNumber,
            required: false
          },
          {
            model: Company,
            attributes: ['id', 'name', 'timezone'],
            required: false
          }
        ]
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      res.json(call);
    } catch (error) {
      console.error('Error fetching call:', error);
      res.status(500).json({ error: 'Failed to fetch call' });
    }
  }

  async createCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { to, from, caller_id } = req.body;

      // Make outbound call through SIP service
      const call = await SipService.makeOutboundCall(
        req.user!.company_id,
        from,
        to,
        caller_id
      );

      // Emit real-time update
      req.socketManager?.emitToCompany(
        req.user!.company_id,
        'call:created',
        call
      );

      res.status(201).json(call);
    } catch (error) {
      console.error('Error creating call:', error);
      res.status(500).json({ error: 'Failed to create call' });
    }
  }

  async updateCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      await call.update(updates);

      // Emit real-time update
      req.socketManager?.emitToCompany(
        req.user!.company_id,
        'call:updated',
        call
      );

      res.json(call);
    } catch (error) {
      console.error('Error updating call:', error);
      res.status(500).json({ error: 'Failed to update call' });
    }
  }

  async deleteCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      await call.destroy();
      res.json({ message: 'Call deleted successfully' });
    } catch (error) {
      console.error('Error deleting call:', error);
      res.status(500).json({ error: 'Failed to delete call' });
    }
  }

  async addTags(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { tag_ids } = req.body;

      console.log('Adding tags to call:', id, 'tags:', tag_ids); // Debug log

      if (!tag_ids || !Array.isArray(tag_ids)) {
        res.status(400).json({ error: 'tag_ids array is required' });
        return;
      }

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      // If tag_ids is empty, remove all tags
      if (tag_ids.length === 0) {
        await CallTag.destroy({
          where: { call_id: call.id }
        });
      } else {
        // Verify tags belong to company and are not deleted
        const tags = await Tag.findAll({
          where: {
            id: { [Op.in]: tag_ids },
            company_id: req.user!.company_id,
            is_deleted: false
          }
        });

        if (tags.length !== tag_ids.length) {
          res.status(400).json({ error: 'Some tags are invalid or deleted' });
          return;
        }

        // Remove all existing tags first
        await CallTag.destroy({
          where: { call_id: call.id }
        });

        // Add all new tags
        await CallTag.bulkAssignTags([call.id], tag_ids, req.user!.id);
      }

      // Fetch updated call with tags
      const updatedCall = await Call.findByPk(call.id, {
        include: [{
          model: Tag,
          through: { attributes: [] },
          attributes: ['id', 'name', 'color', 'description']
        }]
      });

      res.json(updatedCall);
    } catch (error) {
      console.error('Error adding tags:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to add tags',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  }

  async removeTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id, tagId } = req.params;

      const call = await Call.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      await call.$remove('tags', parseInt(tagId));
      res.json({ message: 'Tag removed successfully' });
    } catch (error) {
      console.error('Error removing tag:', error);
      res.status(500).json({ error: 'Failed to remove tag' });
    }
  }

  async getAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { from_date, to_date, group_by = 'day' } = req.query;

      // Get user's company for timezone
      const company = await Company.findByPk(req.user!.company_id);
      const timezone = company?.timezone || 'America/New_York';

      // Convert dates to timezone-aware dates
      const dateRange = getDateRangeInTimezone(from_date as string, to_date as string, timezone);


      // Base query
      const baseWhere: any = {
        company_id: req.user!.company_id
      };

      if (dateRange.from || dateRange.to) {
        baseWhere.start_time = {};
        if (dateRange.from) baseWhere.start_time[Op.gte] = dateRange.from;
        if (dateRange.to) baseWhere.start_time[Op.lte] = dateRange.to;
      }

      // Get summary stats
      const [
        totalCalls,
        answeredCalls,
        missedCalls,
        avgDurationResult,
        uniqueCallers
      ] = await Promise.all([
        Call.count({ where: baseWhere }),
        Call.count({ where: { ...baseWhere, status: 'completed' } }),
        Call.count({ where: { ...baseWhere, status: ['no_answer', 'busy', 'canceled'] } }),
        Call.findOne({
          where: { ...baseWhere, status: 'completed' },
          attributes: [[Sequelize.fn('AVG', Sequelize.col('duration')), 'avg_duration']],
          raw: true
        }) as Promise<{ avg_duration: string | null } | null>,
        Call.count({
          where: baseWhere,
          distinct: true,
          col: 'caller_number'
        })
      ]);

      // Get calls by source with proper grouping
      const callsBySource = await sequelize.query(`
      SELECT 
        COALESCE(tn.source, 'Direct') as source,
        COUNT(*) as total,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as answered,
        CASE 
          WHEN COUNT(*) > 0 
          THEN ROUND((COUNT(CASE WHEN c.status = 'completed' THEN 1 END)::numeric / COUNT(*)::numeric * 100), 2)
          ELSE 0 
        END as conversion_rate
      FROM calls c
      LEFT JOIN tracking_numbers tn ON c.tracking_number_id = tn.id
      WHERE c.company_id = :companyId
        ${from_date ? 'AND c.start_time >= :fromDate' : ''}
        ${to_date ? 'AND c.start_time <= :toDate' : ''}
      GROUP BY COALESCE(tn.source, 'Direct')
      ORDER BY total DESC
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Get calls by tracking number with proper query
      const callsByNumber = await sequelize.query(`
      SELECT 
        c.tracking_number_id,
        tn.phone_number,
        tn.friendly_name,
        COUNT(*) as call_count
      FROM calls c
      INNER JOIN tracking_numbers tn ON c.tracking_number_id = tn.id
      WHERE c.company_id = :companyId
        ${from_date ? 'AND c.start_time >= :fromDate' : ''}
        ${to_date ? 'AND c.start_time <= :toDate' : ''}
      GROUP BY c.tracking_number_id, tn.phone_number, tn.friendly_name
      ORDER BY call_count DESC
      LIMIT 10
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Get hourly distribution
      const hourlyDistribution = await sequelize.query(`
      SELECT 
        EXTRACT(HOUR FROM start_time)::integer as hour,
        COUNT(*)::integer as count
      FROM calls
      WHERE company_id = :companyId
        ${from_date ? 'AND start_time >= :fromDate' : ''}
        ${to_date ? 'AND start_time <= :toDate' : ''}
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY hour ASC
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Get calls by day for the chart
      const callsByDay = await sequelize.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*)::integer as count
      FROM calls
      WHERE company_id = :companyId
        ${from_date ? 'AND start_time >= :fromDate' : ''}
        ${to_date ? 'AND start_time <= :toDate' : ''}
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Get day of week distribution
      const dayOfWeekDistribution = await sequelize.query(`
      SELECT 
        EXTRACT(DOW FROM start_time)::integer as day_of_week,
        COUNT(*)::integer as count
      FROM calls
      WHERE company_id = :companyId
        ${from_date ? 'AND start_time >= :fromDate' : ''}
        ${to_date ? 'AND start_time <= :toDate' : ''}
      GROUP BY EXTRACT(DOW FROM start_time)
      ORDER BY day_of_week ASC
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Get first-time vs repeat callers
      const callerTypes = await sequelize.query(`
      WITH caller_stats AS (
        SELECT 
          caller_number,
          COUNT(*) as call_count,
          MIN(start_time) as first_call_date
        FROM calls
        WHERE company_id = :companyId
          ${from_date ? 'AND start_time >= :fromDate' : ''}
          ${to_date ? 'AND start_time <= :toDate' : ''}
        GROUP BY caller_number
      )
      SELECT 
        CASE 
          WHEN call_count = 1 THEN 'first_time'
          ELSE 'repeat'
        END as caller_type,
        COUNT(*)::integer as count
      FROM caller_stats
      GROUP BY caller_type
    `, {
        replacements: {
          companyId: req.user!.company_id,
          ...(from_date && { fromDate: new Date(from_date as string) }),
          ...(to_date && { toDate: new Date(to_date as string) })
        },
        type: QueryTypes.SELECT
      });

      // Calculate average duration safely with proper typing
      const avgDuration = avgDurationResult?.avg_duration
        ? parseFloat(avgDurationResult.avg_duration)
        : 0;

      // Get first time calls count
      const firstTimeCalls = await Call.count({
        where: { ...baseWhere, is_first_call: true }
      });

      // Build the response matching the expected structure
      res.json({
        summary: {
          total_calls: totalCalls,
          answered_calls: answeredCalls,
          missed_calls: missedCalls,
          first_time_calls: firstTimeCalls,
          average_duration: Math.round(avgDuration),
          answer_rate: totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : '0',
          unique_callers: uniqueCallers
        },
        calls_by_source: callsBySource.map((item: any) => ({
          source: item.source,
          total: parseInt(item.total),
          answered: parseInt(item.answered),
          conversion_rate: item.conversion_rate.toString()
        })),
        calls_by_day: callsByDay.map((item: any) => ({
          date: item.date,
          count: parseInt(item.count)
        })),
        calls_by_hour: hourlyDistribution.map((item: any) => ({
          hour: parseInt(item.hour),
          count: parseInt(item.count)
        })),
        by_tracking_number: callsByNumber,
        day_of_week: dayOfWeekDistribution,
        caller_types: callerTypes,
        date_range: {
          from: from_date || 'all',
          to: to_date || 'all'
        }
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        error: 'Failed to get analytics',
        details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : 'Unknown error' : undefined
      });
    }
  }

  // In backend/src/controllers/CallController.ts

  async getCallsWithVisitors(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { has_visitor, visitor_id } = req.query;

      const where: any = {
        company_id: req.user!.company_id
      };

      // Filter by visitor presence
      if (has_visitor === 'true') {
        where.visitor_id = { [Op.not]: null };
      } else if (has_visitor === 'false') {
        where.visitor_id = null;
      }

      // Filter by specific visitor
      if (visitor_id) {
        where.visitor_id = visitor_id;
      }

      const calls = await Call.findAll({
        where,
        include: [
          {
            model: Visitor,
            required: false,
            attributes: ['id', 'visitor_id', 'first_source', 'first_medium', 'first_campaign', 'page_views']
          },
          {
            model: TrackingNumber,
            attributes: ['phone_number', 'friendly_name', 'is_pool_number']
          }
        ],
        order: [['start_time', 'DESC']],
        limit: 100
      });

      // Calculate attribution stats
      const stats = {
        total_calls: calls.length,
        calls_with_visitors: calls.filter(c => c.visitor_id).length,
        calls_without_visitors: calls.filter(c => !c.visitor_id).length,
        attribution_rate: calls.length > 0
          ? ((calls.filter(c => c.visitor_id).length / calls.length) * 100).toFixed(2) + '%'
          : '0%'
      };

      res.json({
        stats,
        calls: calls.map(call => ({
          id: call.id,
          call_sid: call.call_sid,
          caller_number: call.caller_number,
          start_time: call.start_time,
          duration: call.duration,
          tracking_number: call.tracking_number?.phone_number,
          visitor: call.visitor ? {
            visitor_id: call.visitor.visitor_id,
            source: call.visitor.first_source,
            medium: call.visitor.first_medium,
            campaign: call.visitor.first_campaign,
            page_views: call.visitor.page_views
          } : null,
          has_web_session: !!call.visitor_id
        }))
      });
    } catch (error) {
      console.error('Error fetching calls with visitors:', error);
      res.status(500).json({ error: 'Failed to fetch calls with visitors' });
    }
  }

  // Call control methods (for active calls)
  async transferCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { transfer_to } = req.body;

      // Implementation would interact with SIP service
      res.json({ message: 'Call transfer initiated' });
    } catch (error) {
      console.error('Error transferring call:', error);
      res.status(500).json({ error: 'Failed to transfer call' });
    }
  }

  async holdCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Implementation would interact with SIP service
      res.json({ message: 'Call placed on hold' });
    } catch (error) {
      console.error('Error holding call:', error);
      res.status(500).json({ error: 'Failed to hold call' });
    }
  }

  async unholdCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Implementation would interact with SIP service
      res.json({ message: 'Call resumed' });
    } catch (error) {
      console.error('Error unholding call:', error);
      res.status(500).json({ error: 'Failed to unhold call' });
    }
  }

  async hangupCall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Implementation would interact with SIP service
      res.json({ message: 'Call terminated' });
    } catch (error) {
      console.error('Error hanging up call:', error);
      res.status(500).json({ error: 'Failed to hangup call' });
    }
  }
}

export default new CallController();