// backend/src/controllers/TrackingNumberController.ts (Enhanced version with Twilio integration)
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TrackingNumber, Company, Call, sequelize } from '../models';
import { Op } from 'sequelize';
import TwilioService from '../services/TwilioService';

class TrackingNumberController {
  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status, source, campaign, page = 1, limit = 50 } = req.query;

      const where: any = {
        company_id: req.user!.company_id
      };

      if (status) where.status = status;
      if (source) where.source = source;
      if (campaign) where.campaign = campaign;

      const offset = ((page as number) - 1) * (limit as number);

      const { rows: trackingNumbers, count } = await TrackingNumber.findAndCountAll({
        where,
        include: [{
          model: Company,
          attributes: ['name', 'sip_domain']
        }],
        limit: parseInt(limit as string),
        offset,
        order: [['created_at', 'DESC']]
      });

      res.json({
        tracking_numbers: trackingNumbers,
        pagination: {
          total: count,
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          pages: Math.ceil(count / (limit as number))
        }
      });
    } catch (error) {
      console.error('Error fetching tracking numbers:', error);
      res.status(500).json({ error: 'Failed to fetch tracking numbers' });
    }
  }

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        },
        include: [{
          model: Company,
          attributes: ['name', 'sip_domain']
        }]
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      res.json(trackingNumber);
    } catch (error) {
      console.error('Error fetching tracking number:', error);
      res.status(500).json({ error: 'Failed to fetch tracking number' });
    }
  }

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        phone_number,
        friendly_name,
        source,
        medium,
        campaign,
        description,
        call_flow,
        sms_enabled = false
      } = req.body;

      const company = await Company.findByPk(req.user!.company_id);
      if (!company) {
        res.status(404).json({ error: 'Company not found' });
        return;
      }

      // Check if number already exists
      const existing = await TrackingNumber.findOne({
        where: { phone_number }
      });

      if (existing) {
        res.status(400).json({ error: 'Phone number already exists' });
        return;
      }

      // Merge call flow with company defaults
      const mergedCallFlow = {
        record_calls: company.recording_enabled,
        timeout_seconds: company.default_timeout_seconds,
        voicemail_enabled: company.voicemail_enabled,
        voicemail_greeting: call_flow?.voicemail_greeting || "Please leave a message after the beep.",
        voicemail_transcribe: company.voicemail_transcription,
        ...call_flow
      };

      // Create tracking number in database
      const trackingNumber = await TrackingNumber.create({
        company_id: req.user!.company_id,
        phone_number,
        friendly_name: friendly_name || `Tracking - ${source}`,
        source,
        medium,
        campaign,
        call_flow: {
          record_calls: true,
          timeout_seconds: 30,
          voicemail_enabled: true,
          voicemail_greeting: "Please leave a message after the beep.",
          voicemail_transcribe: true,
          ...call_flow
        },
        sms_enabled,
        sip_uri: '14378861145@sip.ringostat.com', // Set Ringostat SIP URI directly
        status: 'active',
        verified: true,
        verified_at: new Date()
      } as any);

      // Configure the number with Twilio
      try {
        await TwilioService.updateNumberConfiguration(phone_number, {
          voiceUrl: `${process.env.BASE_URL}/api/sip/incoming`,
          smsUrl: sms_enabled ? `${process.env.BASE_URL}/api/texts/webhook/receive` : undefined,
          friendlyName: friendly_name
        });
      } catch (twilioError) {
        console.error('Failed to update Twilio configuration:', twilioError);
        // Don't fail the request, just log the error
      }

      res.status(201).json(trackingNumber);
    } catch (error) {
      console.error('Error creating tracking number:', error);
      res.status(500).json({ error: 'Failed to create tracking number' });
    }
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      // Don't allow changing the phone number
      delete updates.phone_number;

      await trackingNumber.update(updates);

      // Update Twilio configuration if needed
      if (updates.friendly_name || updates.sms_enabled !== undefined) {
        try {
          await TwilioService.updateNumberConfiguration(trackingNumber.phone_number, {
            friendlyName: updates.friendly_name || trackingNumber.friendly_name,
            smsUrl: updates.sms_enabled ? `${process.env.BASE_URL}/api/texts/webhook/receive` : undefined
          });
        } catch (twilioError) {
          console.error('Failed to update Twilio configuration:', twilioError);
        }
      }

      res.json(trackingNumber);
    } catch (error) {
      console.error('Error updating tracking number:', error);
      res.status(500).json({ error: 'Failed to update tracking number' });
    }
  }

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      // Check if there are any calls
      const callCount = await Call.count({
        where: { tracking_number_id: trackingNumber.id }
      });

      if (callCount > 0) {
        res.status(400).json({
          error: 'Cannot delete tracking number with call history. Please archive instead.'
        });
        return;
      }

      await trackingNumber.destroy();
      res.json({ message: 'Tracking number deleted successfully' });
    } catch (error) {
      console.error('Error deleting tracking number:', error);
      res.status(500).json({ error: 'Failed to delete tracking number' });
    }
  }

  async getCallFlow(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        },
        include: [Company]
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      res.json({
        tracking_number: trackingNumber.phone_number,
        friendly_name: trackingNumber.friendly_name,
        sip_destination: trackingNumber.sip_uri,
        call_flow: trackingNumber.call_flow,
        company_defaults: {
          recording_enabled: trackingNumber.company.recording_enabled,
          voicemail_enabled: trackingNumber.company.voicemail_enabled,
          timeout_seconds: trackingNumber.company.default_timeout_seconds
        }
      });
    } catch (error) {
      console.error('Error getting call flow:', error);
      res.status(500).json({ error: 'Failed to get call flow' });
    }
  }

  async updateCallFlow(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { call_flow } = req.body;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      await trackingNumber.update({
        call_flow: {
          ...trackingNumber.call_flow,
          ...call_flow
        }
      });

      res.json(trackingNumber);
    } catch (error) {
      console.error('Error updating call flow:', error);
      res.status(500).json({ error: 'Failed to update call flow' });
    }
  }

  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { date_from, date_to } = req.query;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      const where: any = {
        tracking_number_id: trackingNumber.id
      };

      if (date_from || date_to) {
        where.start_time = {};
        if (date_from) where.start_time[Op.gte] = new Date(date_from as string);
        if (date_to) where.start_time[Op.lte] = new Date(date_to as string);
      }

      // Get call statistics
      const stats = await Call.findOne({
        where,
        attributes: [
          [sequelize.fn('COUNT', '*'), 'total_calls'],
          [sequelize.fn('SUM', sequelize.col('duration')), 'total_duration'],
          [sequelize.fn('AVG', sequelize.col('duration')), 'avg_duration'],
          [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'completed' THEN 1 END")), 'answered_calls'],
          [sequelize.fn('COUNT', sequelize.literal("CASE WHEN is_first_call = true THEN 1 END")), 'first_time_calls']
        ]
      });

      res.json({
        tracking_number: {
          id: trackingNumber.id,
          phone_number: trackingNumber.phone_number,
          friendly_name: trackingNumber.friendly_name
        },
        stats: stats?.dataValues || {
          total_calls: 0,
          total_duration: 0,
          avg_duration: 0,
          answered_calls: 0,
          first_time_calls: 0
        }
      });
    } catch (error) {
      console.error('Error getting tracking number stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }

  /**
   * Search available numbers from Twilio
   */
  async searchAvailableNumbers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { area_code, contains } = req.query;

      const availableNumbers = await TwilioService.searchAvailableNumbers(area_code as string);

      // Filter by contains if provided
      let filtered = availableNumbers;
      if (contains) {
        const searchPattern = (contains as string).replace(/\D/g, '');
        filtered = availableNumbers.filter(num =>
          num.phoneNumber.includes(searchPattern)
        );
      }

      res.json({
        numbers: filtered.map(num => ({
          phone_number: num.phoneNumber,
          friendly_name: num.friendlyName,
          locality: num.locality,
          region: num.region,
          country: num.isoCountry,
          capabilities: {
            voice: num.capabilities.voice,
            sms: num.capabilities.SMS,
            mms: num.capabilities.MMS
          },
          monthly_fee: 1.00, // Twilio typically charges $1/month for local numbers
          per_minute_rate: 0.0140 // Typical Twilio rate
        }))
      });
    } catch (error) {
      console.error('Error searching available numbers:', error);
      res.status(500).json({ error: 'Failed to search available numbers' });
    }
  }

  /**
 * Provision a new number from Twilio
 */
  async provisionNumber(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        phone_number,
        friendly_name,
        source,
        medium,
        campaign,
        description,
        call_flow,
        sms_enabled = false
      } = req.body;

      // Validate company
      const company = await Company.findByPk(req.user!.company_id);
      if (!company) {
        res.status(404).json({ error: 'Company not found' });
        return;
      }

      // Check if number already exists in our system
      const existing = await TrackingNumber.findOne({
        where: { phone_number }
      });

      if (existing) {
        res.status(400).json({ error: 'Phone number already in use' });
        return;
      }

      // IMPORTANT: Provision the number through Twilio FIRST
      // If this fails, we don't want to create a database record
      let provisionedNumber;
      try {
        provisionedNumber = await TwilioService.provisionNumber(
          phone_number,
          friendly_name
        );
      } catch (twilioError: any) {
        // Return the Twilio error to the frontend
        console.error('Twilio provisioning failed:', twilioError);
        res.status(400).json({
          error: twilioError.message || 'Failed to provision number from Twilio',
          details: 'The number could not be purchased from Twilio. Please try a different number.'
        });
        return;
      }

      // Only create database record if Twilio provisioning succeeded
      try {
        // Merge call flow with company defaults
        const mergedCallFlow = {
          record_calls: company.recording_enabled,
          timeout_seconds: company.default_timeout_seconds,
          voicemail_enabled: company.voicemail_enabled,
          voicemail_greeting: call_flow?.voicemail_greeting || "Please leave a message after the beep.",
          voicemail_transcribe: company.voicemail_transcription,
          ...call_flow
        };

        // Create tracking number in database
        const trackingNumber = await TrackingNumber.create({
          company_id: req.user!.company_id,
          phone_number: provisionedNumber.phoneNumber,
          friendly_name: friendly_name || provisionedNumber.friendlyName,
          source,
          medium,
          campaign,
          description,
          call_flow: mergedCallFlow,
          sms_enabled: sms_enabled && provisionedNumber.capabilities.sms,
          provider: 'twilio',
          provider_sid: provisionedNumber.sid,
          status: 'active',
          verified: true,
          verified_at: new Date()
        } as any);

        res.status(201).json({
          tracking_number: trackingNumber,
          message: 'Number provisioned successfully'
        });
      } catch (dbError) {
        // If database creation fails, try to release the number from Twilio
        console.error('Database error after Twilio provisioning:', dbError);

        try {
          await TwilioService.releaseNumber(provisionedNumber.sid);
          console.log('Successfully released number from Twilio after database error');
        } catch (releaseError) {
          console.error('Failed to release number from Twilio after database error:', releaseError);
        }

        res.status(500).json({
          error: 'Failed to save number to database. The number has been released.',
          details: 'Please try again.'
        });
      }
    } catch (error) {
      console.error('Error provisioning number:', error);
      res.status(500).json({ error: 'Failed to provision number' });
    }
  }

  /**
 * Release a tracking number back to Twilio
 */
  async releaseNumber(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const trackingNumber = await TrackingNumber.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!trackingNumber) {
        res.status(404).json({ error: 'Tracking number not found' });
        return;
      }

      // Check if there are any calls
      const callCount = await Call.count({
        where: { tracking_number_id: trackingNumber.id }
      });

      if (callCount > 0) {
        res.status(400).json({
          error: 'Cannot release number with call history',
          details: 'This number has call history and cannot be deleted. Please archive it instead.'
        });
        return;
      }

      // IMPORTANT: Release from Twilio FIRST
      if (trackingNumber.provider_sid) {
        try {
          await TwilioService.releaseNumber(trackingNumber.provider_sid);
        } catch (twilioError: any) {
          console.error('Failed to release from Twilio:', twilioError);
          res.status(400).json({
            error: twilioError.message || 'Failed to release number from Twilio',
            details: 'The number could not be released from your Twilio account.'
          });
          return;
        }
      }

      // Only delete from database if Twilio release succeeded (or no provider_sid)
      await trackingNumber.destroy();

      res.json({
        message: 'Number released successfully',
        details: 'The number has been released from your Twilio account and removed from the system.'
      });
    } catch (error) {
      console.error('Error releasing number:', error);
      res.status(500).json({ error: 'Failed to release number' });
    }
  }
}

const controller = new TrackingNumberController();

// Bind all methods to preserve 'this' context
export default {
  getAll: controller.getAll.bind(controller),
  getById: controller.getById.bind(controller),
  create: controller.create.bind(controller),
  update: controller.update.bind(controller),
  delete: controller.delete.bind(controller),
  getCallFlow: controller.getCallFlow.bind(controller),
  updateCallFlow: controller.updateCallFlow.bind(controller),
  getStats: controller.getStats.bind(controller),
  searchAvailableNumbers: controller.searchAvailableNumbers.bind(controller),
  provisionNumber: controller.provisionNumber.bind(controller),
  releaseNumber: controller.releaseNumber.bind(controller)
};