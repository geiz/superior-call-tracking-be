// Solves conflict Between Request in DOM & in Express. 
import { Request as ExpressRequest, Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../middleware/auth';
import {
  CustomerProfile,
  Call,
  TextConversation,
  TextMessage,
  Visitor,
  PageView,
  FormSubmission
} from '../models';
import WebhookService from '../services/WebhookService';
import { WebhookEvent } from '../types/enums';


class JourneyController {
  async getCustomerJourney(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { phone_number, email } = req.query;

      if (!phone_number && !email) {
        res.status(400).json({ error: 'Phone number or email required' });
        return;
      }

      // Find customer profile
      const where: any = { company_id: req.user!.company_id };
      if (phone_number) where.phone_number = phone_number;
      if (email) where.email = email;

      const customer = await CustomerProfile.findOne({ where });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      // Get all customer interactions
      const [calls, texts, visitors] = await Promise.all([
        // Get calls
        Call.findAll({
          where: {
            company_id: req.user!.company_id,
            caller_number: customer.phone_number
          },
          order: [['start_time', 'DESC']],
          limit: 100,
          include: [
            'tracking_number',
            'tags',
            {
              model: Visitor,
              required: false,
              attributes: ['visitor_id', 'first_source', 'page_views', 'first_landing_page']
            }
          ]
        }),

        // Get text conversations
        TextConversation.findAll({
          where: {
            company_id: req.user!.company_id,
            customer_number: customer.phone_number
          },
          include: [{
            model: TextMessage,
            limit: 5,
            order: [['created_at', 'DESC']]
          }],
          order: [['last_message_at', 'DESC']]
        }),

        // Get visitor sessions
        Visitor.findAll({
          where: {
            company_id: req.user!.company_id,
            [Op.or]: [
              { phone_number: customer.phone_number },
              { email: customer.email }
            ]
          },
          include: [
            {
              model: PageView,
              order: [['timestamp', 'ASC']]
            },
            {
              model: FormSubmission
            }
          ],
          order: [['last_visit_at', 'DESC']]
        })
      ]);

      // Build timeline
      const timeline: any[] = [];

      // Add calls to timeline
      calls.forEach(call => {
        timeline.push({
          type: 'call',
          timestamp: call.start_time,
          data: {
            id: call.id,
            uuid: call.uuid,
            duration: call.duration,
            status: call.status,
            source: call.source,
            campaign: call.campaign,
            recording_url: call.recording_url,
            tags: call.tags,
            tracking_number: call.tracking_number,
            // Add visitor session info
            web_session: call.visitor ? {
              visitor_id: call.visitor.visitor_id,
              landing_page: call.visitor.first_landing_page,
              page_views: call.visitor.page_views
            } : null
          }
        });
      });

      // Add texts to timeline
      texts.forEach(conversation => {
        conversation.messages.forEach(message => {
          timeline.push({
            type: 'text',
            timestamp: message.created_at,
            data: {
              id: message.id,
              direction: message.direction,
              body: message.body,
              conversation_id: conversation.id
            }
          });
        });
      });

      // Add page views and form submissions
      visitors.forEach(visitor => {
        visitor.page_view_records.forEach(view => {
          timeline.push({
            type: 'page_view',
            timestamp: view.timestamp,
            data: {
              page_url: view.page_url,
              page_title: view.page_title,
              time_on_page: view.time_on_page,
              utm_source: view.utm_source,
              utm_campaign: view.utm_campaign
            }
          });
        });

        visitor.form_submissions.forEach(submission => {
          timeline.push({
            type: 'form_submission',
            timestamp: submission.submitted_at,
            data: {
              form_name: submission.form_name,
              page_url: submission.page_url,
              fields: submission.fields
            }
          });
        });
      });

      // Sort timeline by timestamp
      timeline.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Calculate engagement metrics
      const metrics = {
        total_interactions: timeline.length,
        first_interaction: timeline.length > 0 ? timeline[timeline.length - 1].timestamp : null,
        last_interaction: timeline.length > 0 ? timeline[0].timestamp : null,
        total_calls: calls.length,
        total_texts: texts.reduce((sum, conv) => sum + conv.messages.length, 0),
        total_page_views: visitors.reduce((sum, v) => sum + v.page_view_records.length, 0),
        total_forms: visitors.reduce((sum, v) => sum + v.form_submissions.length, 0),
        acquisition_source: customer.acquisition_source,
        lead_score: customer.lead_score,
        lifetime_value: customer.lifetime_value
      };

      res.json({
        customer,
        metrics,
        timeline: timeline.slice(0, 100) // Limit to 100 most recent events
      });
    } catch (error) {
      console.error('Error fetching customer journey:', error);
      res.status(500).json({ error: 'Failed to fetch customer journey' });
    }
  }

  async updateCustomerProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const customer = await CustomerProfile.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      await customer.update(updates);
      res.json(customer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  }

  async getCustomerList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        lead_status,
        lifecycle_stage,
        search,
        page = 1,
        limit = 50
      } = req.query;

      const where: any = {
        company_id: req.user!.company_id
      };

      if (lead_status) where.lead_status = lead_status;
      if (lifecycle_stage) where.lifecycle_stage = lifecycle_stage;

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone_number: { [Op.like]: `%${search}%` } },
          { company: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const offset = ((page as number) - 1) * (limit as number);

      const { rows: customers, count } = await CustomerProfile.findAndCountAll({
        where,
        limit: parseInt(limit as string),
        offset,
        order: [['last_contact_at', 'DESC']]
      });

      res.json({
        customers,
        pagination: {
          total: count,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(count / (limit as number))
        }
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  }

  async trackPageView(req: ExpressRequest, res: Response): Promise<void> {
    try {
      const {
        visitor_id,
        company_id,
        page_url,
        page_title,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign
      } = req.body;

      // Find or create visitor
      const [visitor] = await Visitor.findOrCreate({
        where: {
          company_id,
          visitor_id
        },
        defaults: {
          company_id,
          visitor_id,
          first_visit_at: new Date(),
          first_source: utm_source,
          first_medium: utm_medium,
          first_campaign: utm_campaign,
          first_landing_page: page_url,
          ip_address: req.ip,
          user_agent: req.headers['user-agent']
        } as any
      });

      // Update visitor stats
      await visitor.update({
        page_views: visitor.page_views + 1,
        last_visit_at: new Date()
      });

      // Create page view
      const pageView = await PageView.create({
        visitor_id: visitor.id,
        company_id,
        page_url,
        page_title,
        referrer,
        timestamp: new Date(),
        utm_source,
        utm_medium,
        utm_campaign
      } as any);

      res.json({ success: true, visitor_id: visitor.visitor_id });
    } catch (error) {
      console.error('Error tracking page view:', error);
      res.status(500).json({ error: 'Failed to track page view' });
    }
  }

  async trackFormSubmission(req: ExpressRequest, res: Response): Promise<void> {
    try {
      const {
        visitor_id,
        company_id,
        form_id,
        form_name,
        page_url,
        fields
      } = req.body;

      // Find visitor
      const visitor = await Visitor.findOne({
        where: { company_id, visitor_id }
      });

      // Create form submission
      const submission = await FormSubmission.create({
        company_id,
        visitor_id: visitor?.id,
        form_id,
        form_name,
        page_url,
        fields,
        // Extract common fields
        name: fields.name || fields.full_name,
        email: fields.email,
        phone: fields.phone || fields.phone_number,
        company: fields.company,
        source: fields.utm_source,
        medium: fields.utm_medium,
        campaign: fields.utm_campaign,
        submitted_at: new Date()
      });

      // Update visitor with contact info if available
      if (visitor && (fields.email || fields.phone)) {
        await visitor.update({
          email: fields.email || visitor.email,
          phone_number: fields.phone || visitor.phone_number
        });
      }

      // Create or update customer profile
      if (fields.email || fields.phone) {
        const [customer] = await CustomerProfile.findOrCreate({
          where: {
            company_id,
            [Op.or]: [
              fields.email ? { email: fields.email } : {},
              fields.phone ? { phone_number: fields.phone } : {}
            ]
          },
          defaults: {
            name: fields.name,
            email: fields.email,
            phone_number: fields.phone,
            company: fields.company,
            acquisition_source: fields.utm_source || 'form',
            acquisition_medium: fields.utm_medium,
            acquisition_campaign: fields.utm_campaign,
            acquisition_date: new Date(),
            first_contact_at: new Date()
          } as any
        });

        await customer.update({
          total_forms: customer.total_forms + 1,
          last_contact_at: new Date()
        });
      }

      // Trigger webhook
      await WebhookService.triggerWebhooks(
        company_id,
        WebhookEvent.FORM_SUBMITTED,
        submission.uuid,
        {
          form_id,
          form_name,
          page_url,
          fields,
          visitor_id
        }
      );

      res.json({ success: true, submission_id: submission.uuid });
    } catch (error) {
      console.error('Error tracking form submission:', error);
      res.status(500).json({ error: 'Failed to track form submission' });
    }
  }
}

export default new JourneyController();