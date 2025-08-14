// backend/src/controllers/DniController.ts - Fixed imports

import { Request, Response } from 'express';
import { DniService } from '../services/DniService';
import { PageView, FormSubmission } from '../models';
import {
  CreateVisitorRequest,
  TrackPageViewRequest,
  TrackFormSubmissionRequest
} from '../types/interfaces';
import { AuthRequest } from '../middleware/auth';

export class DniController {
  /**
   * Create a new visitor session and assign a tracking number
   * POST /api/dni/visitor
   */
  async createVisitor(req: Request<{}, {}, CreateVisitorRequest>, res: Response): Promise<void> {
    try {
      const {
        company_id,
        page_url,
        page_title,
        referrer,
        user_agent,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        gclid,
        fbclid,
        msclkid
      } = req.body;

      // Validate required fields
      if (!company_id || !page_url) {
        res.status(400).json({ 
          error: 'Missing required fields', 
          details: 'company_id and page_url are required' 
        });
        return;
      }

      // Get IP address from request
      const ip_address = req.ip || req.connection.remoteAddress;

      const result = await DniService.createVisitorSession({
        company_id,
        page_url,
        page_title,
        referrer,
        user_agent: user_agent || req.headers['user-agent'],
        ip_address,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        gclid,
        fbclid,
        msclkid
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating visitor:', error);
      res.status(500).json({ 
        error: 'Failed to create visitor session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get existing visitor session
   * GET /api/dni/visitor/:visitorId
   */
  async getVisitor(req: Request<{ visitorId: string }>, res: Response): Promise<void> {
    try {
      const { visitorId } = req.params;

      if (!visitorId) {
        res.status(400).json({ error: 'Visitor ID is required' });
        return;
      }

      const session = await DniService.getVisitorSession(visitorId);

      if (!session) {
        res.status(404).json({ error: 'Visitor session not found' });
        return;
      }

      res.json({
        visitor_id: session.visitorId,
        assigned_number: session.assignedNumber,
        session_active: true,
        attribution: session.attribution
      });
    } catch (error) {
      console.error('Error fetching visitor:', error);
      res.status(500).json({ 
        error: 'Failed to fetch visitor session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Track a page view
   * POST /api/dni/track/pageview
   */
  async trackPageView(req: Request<{}, {}, TrackPageViewRequest>, res: Response): Promise<void> {
    try {
      const {
        visitor_id,
        company_id,
        page_url,
        page_title,
        referrer,
        timestamp,
        utm_source,
        utm_medium,
        utm_campaign
      } = req.body;

      // Validate required fields
      if (!visitor_id || !company_id || !page_url) {
        res.status(400).json({ 
          error: 'Missing required fields',
          details: 'visitor_id, company_id, and page_url are required'
        });
        return;
      }

      // Get visitor session
      const session = await DniService.getVisitorSession(visitor_id);
      
      if (!session) {
        res.status(404).json({ error: 'Visitor session not found' });
        return;
      }

      // Create page view record
      await PageView.create({
        visitor_id: session.visitorRecord?.id,
        company_id: parseInt(company_id),
        page_url,
        page_title,
        referrer,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        utm_source,
        utm_medium,
        utm_campaign
      } as any);

      // Update visitor stats if we have a visitor record
      if (session.visitorRecord) {
        await session.visitorRecord.increment('page_views');
        await session.visitorRecord.update({ last_visit_at: new Date() });
      }

      res.json({ 
        success: true, 
        message: 'Page view tracked successfully' 
      });
    } catch (error) {
      console.error('Error tracking page view:', error);
      res.status(500).json({ 
        error: 'Failed to track page view',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Track a form submission
   * POST /api/dni/track/form
   */
  async trackFormSubmission(req: Request<{}, {}, TrackFormSubmissionRequest>, res: Response): Promise<void> {
    try {
      const {
        visitor_id,
        company_id,
        form_id,
        form_name,
        page_url,
        fields
      } = req.body;

      // Validate required fields
      if (!visitor_id || !company_id || !page_url || !fields) {
        res.status(400).json({ 
          error: 'Missing required fields',
          details: 'visitor_id, company_id, page_url, and fields are required'
        });
        return;
      }

      // Get visitor session
      const session = await DniService.getVisitorSession(visitor_id);

      // Create form submission
      const submission = await FormSubmission.create({
        company_id: parseInt(company_id),
        visitor_id: session?.visitorRecord?.id,
        form_id,
        form_name: form_name || 'Contact Form',
        page_url,
        fields,
        // Extract common fields
        name: fields.name || fields.full_name || fields.first_name,
        email: fields.email,
        phone: fields.phone || fields.phone_number,
        company: fields.company || fields.organization,
        // Attribution
        source: fields.utm_source || session?.attribution.source,
        medium: fields.utm_medium || session?.attribution.medium,
        campaign: fields.utm_campaign || session?.attribution.campaign,
        gclid: fields.gclid || session?.attribution.gclid,
        fbclid: fields.fbclid || session?.attribution.fbclid,
        submitted_at: new Date()
      } as any);

      // Update visitor with contact info if available
      if (session?.visitorRecord && (fields.email || fields.phone)) {
        await session.visitorRecord.update({
          email: fields.email || session.visitorRecord.email,
          phone_number: fields.phone || session.visitorRecord.phone_number
        });
      }

      res.json({ 
        success: true, 
        submission_id: submission.id,
        message: 'Form submission tracked successfully'
      });
    } catch (error) {
      console.error('Error tracking form submission:', error);
      res.status(500).json({ 
        error: 'Failed to track form submission',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get pool status for a company (requires authentication)
   * GET /api/dni/pool/:companyId
   */
  async getPoolStatus(req: AuthRequest<{ companyId: string }>, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const requestingCompanyId = req.user?.company_id;

      // Validate company ID
      if (!companyId || isNaN(parseInt(companyId))) {
        res.status(400).json({ error: 'Invalid company ID' });
        return;
      }

      // Check authorization - users can only view their own company's pool
      if (requestingCompanyId !== parseInt(companyId) && req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Unauthorized to view this company\'s pool' });
        return;
      }

      const poolStatus = await DniService.getPoolStatus(parseInt(companyId));

      res.json(poolStatus);
    } catch (error) {
      console.error('Error fetching pool status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch pool status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Release a number assignment (requires authentication)
   * POST /api/dni/pool/:companyId/release
   */
  async releaseNumber(req: AuthRequest<{ companyId: string }, {}, { tracking_number_id: number }>, res: Response): Promise<void> {
    try {
      const { companyId } = req.params;
      const { tracking_number_id } = req.body;
      const requestingCompanyId = req.user?.company_id;

      // Validate inputs
      if (!companyId || isNaN(parseInt(companyId))) {
        res.status(400).json({ error: 'Invalid company ID' });
        return;
      }

      if (!tracking_number_id || isNaN(tracking_number_id)) {
        res.status(400).json({ error: 'Invalid tracking number ID' });
        return;
      }

      // Check authorization
      if (requestingCompanyId !== parseInt(companyId) && req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Unauthorized to manage this company\'s pool' });
        return;
      }

      const success = await DniService.releaseNumber(
        parseInt(companyId),
        tracking_number_id
      );

      if (success) {
        res.json({ 
          success: true, 
          message: 'Number released successfully' 
        });
      } else {
        res.status(404).json({ 
          error: 'Number not found or not releasable' 
        });
      }
    } catch (error) {
      console.error('Error releasing number:', error);
      res.status(500).json({ 
        error: 'Failed to release number',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cleanup expired sessions (requires authentication)
   * POST /api/dni/cleanup
   */
  async cleanupSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Only admins can trigger cleanup
      if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can trigger session cleanup' });
        return;
      }

      const cleaned = await DniService.cleanupExpiredSessions();

      res.json({ 
        success: true, 
        sessions_cleaned: cleaned,
        message: `Released ${cleaned} expired number assignments`
      });
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      res.status(500).json({ 
        error: 'Failed to cleanup sessions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}