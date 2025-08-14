// backend/src/services/DniService.ts - Fixed TypeScript version

import { Op, Transaction, QueryTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { sequelize, TrackingNumber, Visitor, Company, PageView, FormSubmission } from '../models';
import type {
  DniConfig,
  VisitorSession,
  CreateVisitorRequest,
  CreateVisitorResponse,
  NumberPoolStats,
  PoolNumber,
  AvailablePoolNumber
} from '../types/interfaces';
import redisClient from '../config/redis';

export class DniService {
  private static readonly CACHE_TTL = 60; // 1 minute
  private static readonly SESSION_DURATION = 60; // 1 minute default

  private static readonly TEST_NUMBERS = [
    '+14165551234',
    '14165551234',
    '4165551234'
  ];

  /**
   * Get company DNI configuration
   */
  static async getCompanyConfig(companyId: number): Promise<DniConfig | null> {
    const cacheKey = `dni:config:${companyId}`;
    
    // Check cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const company = await Company.findByPk(companyId, {
      attributes: ['id', 'dni_enabled', 'dni_session_duration', 'dni_assignment_strategy']
    });

    if (!company) {
      return null;
    }

    const config: DniConfig = {
      companyId: company.id,
      dniEnabled: company.dni_enabled,
      sessionDuration: company.dni_session_duration,
      assignmentStrategy: company.dni_assignment_strategy as 'least_used' | 'round_robin' | 'sticky'
    };

    // Cache the config - use setEx (capital E) for newer redis client
    await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(config));

    return config;
  }

  /**
   * Create or retrieve a visitor session
   */
  static async createVisitorSession(data: CreateVisitorRequest): Promise<CreateVisitorResponse> {
    const companyId = parseInt(data.company_id);
    
    // Get company config
    const config = await this.getCompanyConfig(companyId);
    if (!config || !config.dniEnabled) {
      throw new Error('DNI is not enabled for this company');
    }

    // Generate visitor ID
    const visitorId = uuidv4();

    // Assign tracking number
    const assignedNumber = await this.assignNumberToVisitor(
      companyId,
      visitorId,
      data.utm_source,
      data.utm_medium,
      data.utm_campaign
    );
    

    // Create visitor record - handle null as undefined for optional fields
    const visitor = await Visitor.create({
      company_id: companyId,
      visitor_id: visitorId,
      assigned_number: assignedNumber || undefined, // Convert null to undefined
      assigned_at: new Date(),
      first_visit_at: new Date(),
      last_visit_at: new Date(),
      first_landing_page: data.page_url,
      first_referrer: data.referrer, // This field might need to be added to model
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      first_source: data.utm_source,
      first_medium: data.utm_medium,
      first_campaign: data.utm_campaign,
      first_term: data.utm_term,
      first_content: data.utm_content,
      gclid: data.gclid,
      fbclid: data.fbclid,
      msclkid: data.msclkid,
      page_views: 1,
      session_data: {
        createdAt: new Date(),
        pageViews: 1,
        duration: 0,
        lastActivity: new Date()
      }
    } as any);

    // Cache visitor session - use setEx
    const sessionKey = `dni:session:${visitorId}`;
    await redisClient.setEx(sessionKey, config.sessionDuration, JSON.stringify({
      visitorId,
      companyId,
      assignedNumber,
      createdAt: new Date()
    }));

    return {
      visitor_id: visitorId,
      assigned_number: assignedNumber,
      session_duration: config.sessionDuration * 1000 // Convert to milliseconds
    };
  }

  /**
   * Get existing visitor session
   */
  static async getVisitorSession(visitorId: string): Promise<VisitorSession | null> {
    // Check cache first
    const sessionKey = `dni:session:${visitorId}`;
    const cached = await redisClient.get(sessionKey);

    const visitor = await Visitor.findOne({
      where: { visitor_id: visitorId },
      include: [{
        model: PageView,
        as: 'page_view_records',
        limit: 10,
        order: [['timestamp', 'DESC']]
      }]
    });

    if (!visitor) {
      return null;
    }

    // Check if number assignment is still valid
    const assignmentAge = Date.now() - visitor.assigned_at.getTime();
    const company = await Company.findByPk(visitor.company_id);
    const sessionDuration = company?.dni_session_duration || this.SESSION_DURATION;

    if (assignmentAge > sessionDuration * 1000) {
      // Re-assign number
      const newNumber = await this.assignNumberToVisitor(
        visitor.company_id,
        visitor.visitor_id,
        visitor.first_source,
        visitor.first_medium,
        visitor.first_campaign
      );

      if (newNumber && newNumber !== visitor.assigned_number) {
        await visitor.update({
          assigned_number: newNumber || undefined,
          assigned_at: new Date()
        });
      }
    }

    // Extend session in cache
    if (cached) {
      await redisClient.expire(sessionKey, sessionDuration);
    }

    return {
      visitorId: visitor.visitor_id,
      companyId: visitor.company_id,
      assignedNumber: visitor.assigned_number || null,
      assignedAt: visitor.assigned_at,
      sessionData: visitor.session_data as any,
      visitorRecord: visitor,
      attribution: {
        source: visitor.first_source,
        medium: visitor.first_medium,
        campaign: visitor.first_campaign,
        term: visitor.first_term,
        content: visitor.first_content,
        gclid: visitor.gclid,
        fbclid: visitor.fbclid,
        msclkid: visitor.msclkid
      },
      firstVisit: {
        timestamp: visitor.first_visit_at,
        landingPage: visitor.first_landing_page || '',
        referrer: undefined // Since first_referrer doesn't exist on model
      },
      location: visitor.ip_address ? {
        ipAddress: visitor.ip_address.toString(),
        country: visitor.country,
        region: visitor.region,
        city: visitor.city
      } : undefined,
      device: visitor.user_agent ? {
        userAgent: visitor.user_agent,
        deviceType: visitor.device_type,
        browser: visitor.browser,
        os: visitor.os
      } : undefined
    };
  }

  /**
   * Assign a tracking number to a visitor
   */
  private static async assignNumberToVisitor(
    companyId: number,
    visitorId: string,
    source?: string,
    medium?: string,
    campaign?: string
  ): Promise<string | null> {
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
    });

    try {
      // Call the stored function to get available numbers
      const availableNumbers = await sequelize.query<AvailablePoolNumber>(
        'SELECT * FROM get_available_pool_numbers(:companyId, :source, :medium, :campaign)',
        {
          replacements: {
            companyId,
            source: source || null,
            medium: medium || null,
            campaign: campaign || null
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );

      // Filter out test numbers
      const validNumbers = availableNumbers.filter(num => {
        const cleanedNumber = num.phone_number.replace(/\D/g, '');
        return !this.TEST_NUMBERS.some(testNum => {
          const cleanedTest = testNum.replace(/\D/g, '');
          return cleanedNumber.includes(cleanedTest);
        });
      });

      if (validNumbers.length === 0) {
        // No pool numbers available, try to get default number
        const defaultNumber = await TrackingNumber.findOne({
          where: {
            company_id: companyId,
            is_default: true,
            status: 'active',
            // Exclude test numbers
            phone_number: {
              [Op.notIn]: this.TEST_NUMBERS
            }
          },
          attributes: ['phone_number'],
          transaction
        });

        await transaction.commit();
        return defaultNumber?.phone_number || null;
      }

      // Get the highest priority number
      const selectedNumber = availableNumbers[0];

      // Update the tracking number with assignment
      await TrackingNumber.update(
        {
          assigned_to_visitor_at: new Date(),
          last_assigned_at: new Date(),
          assignment_count: sequelize.literal('assignment_count + 1') as any
        },
        {
          where: { id: selectedNumber.tracking_number_id },
          transaction
        }
      );

      // Get visitor record to record in history
      const visitor = await Visitor.findOne({
        where: { visitor_id: visitorId },
        attributes: ['id'],
        transaction
      });

      if (visitor) {
        // Record in history
        await sequelize.query(
          `INSERT INTO visitor_number_history 
           (visitor_id, tracking_number_id, assigned_at, source, medium, campaign) 
           VALUES 
           (:visitorId, :trackingNumberId, NOW(), :source, :medium, :campaign)`,
          {
            replacements: {
              visitorId: visitor.id,
              trackingNumberId: selectedNumber.tracking_number_id,
              source: source || null,
              medium: medium || null,
              campaign: campaign || null
            },
            transaction
          }
        );

        // Update visitor with tracking number ID using the proper update syntax
        await visitor.update({
          tracking_number_id: selectedNumber.tracking_number_id
        } as any, { transaction });
      }

      await transaction.commit();
      return selectedNumber.phone_number;
    } catch (error) {
      await transaction.rollback();
      console.error('Error assigning number to visitor:', error);
      return null;
    }
  }

  /**
   * Get pool status for a company
   */
  static async getPoolStatus(companyId: number): Promise<NumberPoolStats> {
    const poolNumbers = await TrackingNumber.findAll({
      where: {
        company_id: companyId,
        is_pool_number: true,
        status: 'active'
      },
      attributes: [
        'id',
        'phone_number',
        'friendly_name',
        'source',
        'medium',
        'campaign',
        'assigned_to_visitor_at',
        'last_assigned_at',
        'assignment_count',
        'total_calls'
      ],
      order: [['last_assigned_at', 'ASC NULLS FIRST']]
    });

    const now = Date.now();
    const sessionDuration = (await this.getCompanyConfig(companyId))?.sessionDuration || this.SESSION_DURATION;

    const numbers: PoolNumber[] = poolNumbers.map(n => {
      const isAvailable = !n.assigned_to_visitor_at || 
        (now - n.assigned_to_visitor_at.getTime() > sessionDuration * 1000);

      return {
        id: n.id,
        phone_number: n.phone_number,
        friendly_name: n.friendly_name || undefined, // Handle potential null
        source: n.source,
        medium: n.medium || undefined, // Handle potential null
        campaign: n.campaign || undefined, // Handle potential null
        assigned_to_visitor_at: n.assigned_to_visitor_at || null, // Explicitly null not undefined
        last_assigned_at: n.last_assigned_at || null, // Explicitly null not undefined
        assignment_count: n.assignment_count,
        total_calls: n.total_calls,
        is_available: isAvailable
      };
    });

    return {
      total_pool_numbers: numbers.length,
      available_numbers: numbers.filter(n => n.is_available).length,
      assigned_numbers: numbers.filter(n => !n.is_available).length,
      numbers
    };
  }

  /**
   * Release a number assignment
   */
  static async releaseNumber(companyId: number, trackingNumberId: number): Promise<boolean> {
    try {
      const result = await TrackingNumber.update(
        { 
          assigned_to_visitor_at: undefined // Use undefined instead of null for Sequelize
        } as any,
        {
          where: {
            id: trackingNumberId,
            company_id: companyId,
            is_pool_number: true
          }
        }
      );

      // Update history
      await sequelize.query(
        `UPDATE visitor_number_history 
         SET released_at = NOW() 
         WHERE tracking_number_id = :trackingNumberId 
         AND released_at IS NULL`,
        {
          replacements: { trackingNumberId }
        }
      );

      return result[0] > 0;
    } catch (error) {
      console.error('Error releasing number:', error);
      return false;
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      // Get all companies with DNI enabled
      const companies = await Company.findAll({
        where: { dni_enabled: true },
        attributes: ['id', 'dni_session_duration']
      });

      let totalCleaned = 0;

      for (const company of companies) {
        const sessionDuration = company.dni_session_duration || this.SESSION_DURATION;
        
        // Release numbers assigned more than session duration ago
        const result = await TrackingNumber.update(
          { 
            assigned_to_visitor_at: undefined // Use undefined instead of null
          } as any,
          {
            where: {
              company_id: company.id,
              is_pool_number: true,
              assigned_to_visitor_at: {
                [Op.lt]: new Date(Date.now() - sessionDuration * 1000)
              }
            }
          }
        );

        totalCleaned += result[0];
      }

      return totalCleaned;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }
}