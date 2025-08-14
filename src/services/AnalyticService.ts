import { 
  Call, 
  TextMessage, 
  CustomerProfile,
  TrackingNumber,
  sequelize 
} from '../models';
import { Op, QueryTypes } from 'sequelize';
import { CallStatus } from '../types/enums';

interface DateRange {
  start?: Date;
  end?: Date;
}

interface CallMetrics {
  total: number;
  answered: number;
  missed: number;
  first_time: number;
  answer_rate: string;
  avg_duration: number;
}

interface TextMetrics {
  total: number;
  sent: number;
  received: number;
  response_rate: string;
}

interface CustomerMetrics {
  total: number;
  new_leads: number;
  qualified: number;
  customers: number;
  conversion_rate: string;
}

interface SourceMetric {
  name: string;
  total: number;
  answered: number;
  conversion_rate: string;
}

export class AnalyticsService {
  async getDashboardMetrics(companyId: number, dateRange: DateRange = {}) {
    const [
      callMetrics,
      textMetrics,
      customerMetrics,
      sourceMetrics,
      callTrends,
      hourlyDistribution
    ] = await Promise.all([
      this.getCallMetrics(companyId, dateRange),
      this.getTextMetrics(companyId, dateRange),
      this.getCustomerMetrics(companyId),
      this.getSourceMetrics(companyId, dateRange),
      this.getCallTrends(companyId, 30),
      this.getHourlyDistribution(companyId, dateRange)
    ]);

    return {
      calls: callMetrics,
      texts: textMetrics,
      customers: customerMetrics,
      sources: sourceMetrics,
      trends: callTrends,
      hourly: hourlyDistribution
    };
  }

  private async getCallMetrics(
    companyId: number, 
    dateRange: DateRange
  ): Promise<CallMetrics> {
    const where: any = { company_id: companyId };
    
    if (dateRange.start || dateRange.end) {
      where.start_time = {};
      if (dateRange.start) where.start_time[Op.gte] = dateRange.start;
      if (dateRange.end) where.start_time[Op.lte] = dateRange.end;
    }

    const [
      total,
      answered,
      missed,
      firstTime,
      avgDuration
    ] = await Promise.all([
      Call.count({ where }),
      Call.count({ where: { ...where, status: CallStatus.COMPLETED } }),
      Call.count({ 
        where: { 
          ...where, 
          status: [CallStatus.NO_ANSWER, CallStatus.BUSY, CallStatus.CANCELED] 
        } 
      }),
      Call.count({ where: { ...where, is_first_call: true } }),
      Call.findOne({
        where,
        attributes: [[sequelize.fn('AVG', sequelize.col('duration')), 'avg']]
      })
    ]);

    return {
      total,
      answered,
      missed,
      first_time: firstTime,
      answer_rate: total > 0 ? (answered / total * 100).toFixed(2) : '0',
      avg_duration: Math.round(avgDuration?.get('avg') as number || 0)
    };
  }

  private async getTextMetrics(
    companyId: number, 
    dateRange: DateRange
  ): Promise<TextMetrics> {
    const where: any = { company_id: companyId };
    
    if (dateRange.start || dateRange.end) {
      where.created_at = {};
      if (dateRange.start) where.created_at[Op.gte] = dateRange.start;
      if (dateRange.end) where.created_at[Op.lte] = dateRange.end;
    }

    const [total, sent, received] = await Promise.all([
      TextMessage.count({ where }),
      TextMessage.count({ where: { ...where, direction: 'outbound' } }),
      TextMessage.count({ where: { ...where, direction: 'inbound' } })
    ]);

    return {
      total,
      sent,
      received,
      response_rate: sent > 0 ? (received / sent * 100).toFixed(2) : '0'
    };
  }

  private async getCustomerMetrics(companyId: number): Promise<CustomerMetrics> {
    const [
      total,
      newLeads,
      qualified,
      customers
    ] = await Promise.all([
      CustomerProfile.count({ where: { company_id: companyId } }),
      CustomerProfile.count({ 
        where: { company_id: companyId, lead_status: 'new' } 
      }),
      CustomerProfile.count({ 
        where: { company_id: companyId, lead_status: 'qualified' } 
      }),
      CustomerProfile.count({ 
        where: { company_id: companyId, lifecycle_stage: 'customer' } 
      })
    ]);

    return {
      total,
      new_leads: newLeads,
      qualified,
      customers,
      conversion_rate: total > 0 ? (customers / total * 100).toFixed(2) : '0'
    };
  }

  private async getSourceMetrics(
    companyId: number, 
    dateRange: DateRange
  ): Promise<SourceMetric[]> {
    const where: any = { company_id: companyId };
    
    if (dateRange.start || dateRange.end) {
      where.start_time = {};
      if (dateRange.start) where.start_time[Op.gte] = dateRange.start;
      if (dateRange.end) where.start_time[Op.lte] = dateRange.end;
    }

    const sources = await Call.findAll({
      where,
      attributes: [
        'source',
        [sequelize.fn('COUNT', '*'), 'total'],
        [sequelize.fn('COUNT', sequelize.literal(
          "CASE WHEN status = 'completed' THEN 1 END"
        )), 'answered']
      ],
      group: ['source'],
      order: [[sequelize.literal('total'), 'DESC']],
      limit: 10
    });

    return sources.map(source => ({
      name: source.source || 'Direct',
      total: parseInt(source.get('total') as string),
      answered: parseInt(source.get('answered') as string),
      conversion_rate: parseInt(source.get('total') as string) > 0 
        ? (parseInt(source.get('answered') as string) / parseInt(source.get('total') as string) * 100).toFixed(2)
        : '0'
    }));
  }

  async getCallTrends(companyId: number, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = `
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as answered,
        COUNT(CASE WHEN is_first_call = true THEN 1 END) as first_time
      FROM calls
      WHERE company_id = :companyId
        AND start_time >= :startDate
      GROUP BY DATE(start_time)
      ORDER BY date ASC
    `;

    const results = await sequelize.query(query, {
      replacements: { companyId, startDate },
      type: QueryTypes.SELECT
    });

    return results;
  }

  async getHourlyDistribution(companyId: number, dateRange: DateRange) {
    const where: any = { company_id: companyId };
    
    if (dateRange.start || dateRange.end) {
      where.start_time = {};
      if (dateRange.start) where.start_time[Op.gte] = dateRange.start;
      if (dateRange.end) where.start_time[Op.lte] = dateRange.end;
    }

    const query = `
      SELECT 
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as count
      FROM calls
      WHERE company_id = :companyId
        ${dateRange.start ? 'AND start_time >= :start' : ''}
        ${dateRange.end ? 'AND start_time <= :end' : ''}
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY hour ASC
    `;

    const results = await sequelize.query(query, {
      replacements: {
        companyId,
        start: dateRange.start,
        end: dateRange.end
      },
      type: QueryTypes.SELECT
    });

    // Fill in missing hours with 0
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: 0
    }));

    results.forEach((result: any) => {
      hourlyData[result.hour] = {
        hour: result.hour,
        count: parseInt(result.count)
      };
    });

    return hourlyData;
  }

  async getTrackingNumberPerformance(companyId: number, dateRange: DateRange) {
    const where: any = { company_id: companyId };
    
    if (dateRange.start || dateRange.end) {
      where.start_time = {};
      if (dateRange.start) where.start_time[Op.gte] = dateRange.start;
      if (dateRange.end) where.start_time[Op.lte] = dateRange.end;
    }

    const trackingNumbers = await TrackingNumber.findAll({
      where: { company_id: companyId, status: 'active' },
      include: [{
        model: Call,
        where,
        required: false,
        attributes: []
      }],
      attributes: [
        'id',
        'phone_number',
        'friendly_name',
        'source',
        'campaign',
        [sequelize.fn('COUNT', sequelize.col('calls.id')), 'total_calls'],
        [sequelize.fn('COUNT', sequelize.literal(
          "CASE WHEN calls.status = 'completed' THEN 1 END"
        )), 'answered_calls'],
        [sequelize.fn('AVG', sequelize.col('calls.duration')), 'avg_duration'],
        [sequelize.fn('COUNT', sequelize.literal(
          "CASE WHEN calls.is_first_call = true THEN 1 END"
        )), 'first_time_calls']
      ],
      group: [
        'TrackingNumber.id',
        'TrackingNumber.phone_number',
        'TrackingNumber.friendly_name',
        'TrackingNumber.source',
        'TrackingNumber.campaign'
      ],
      order: [[sequelize.literal('total_calls'), 'DESC']]
    });

    return trackingNumbers.map(tn => ({
      id: tn.id,
      phone_number: tn.phone_number,
      friendly_name: tn.friendly_name,
      source: tn.source,
      campaign: tn.campaign,
      metrics: {
      total_calls: Number(tn.get('total_calls') ?? 0),
        answered_calls: parseInt(tn.get('answered_calls') as string || '0'),
        avg_duration: Math.round(parseFloat(tn.get('avg_duration') as string || '0')),
        first_time_calls: parseInt(tn.get('first_time_calls') as string || '0'),
        answer_rate: tn.get('total_calls') > 0
          ? ((tn.get('answered_calls') as number) / (tn.get('total_calls') as number) * 100).toFixed(2)
          : '0'
      }
    }));
  }

  async getConversionFunnel(companyId: number, dateRange: DateRange) {
    const query = `
      WITH funnel AS (
        SELECT 
          COUNT(DISTINCT caller_number) as unique_callers,
          COUNT(DISTINCT CASE WHEN is_first_call = true THEN caller_number END) as new_callers,
          COUNT(DISTINCT CASE WHEN lead_status = 'contacted' THEN caller_number END) as contacted,
          COUNT(DISTINCT CASE WHEN lead_status = 'qualified' THEN caller_number END) as qualified,
          COUNT(DISTINCT CASE WHEN lead_status = 'customer' THEN caller_number END) as customers
        FROM calls
        WHERE company_id = :companyId
          ${dateRange.start ? 'AND start_time >= :start' : ''}
          ${dateRange.end ? 'AND start_time <= :end' : ''}
      )
      SELECT 
        'Unique Callers' as stage,
        unique_callers as count,
        100 as percentage
      FROM funnel
      UNION ALL
      SELECT 
        'New Callers' as stage,
        new_callers as count,
        CASE WHEN unique_callers > 0 
          THEN ROUND(new_callers::numeric / unique_callers * 100, 2) 
          ELSE 0 
        END as percentage
      FROM funnel
      UNION ALL
      SELECT 
        'Contacted' as stage,
        contacted as count,
        CASE WHEN unique_callers > 0 
          THEN ROUND(contacted::numeric / unique_callers * 100, 2) 
          ELSE 0 
        END as percentage
      FROM funnel
      UNION ALL
      SELECT 
        'Qualified' as stage,
        qualified as count,
        CASE WHEN unique_callers > 0 
          THEN ROUND(qualified::numeric / unique_callers * 100, 2) 
          ELSE 0 
        END as percentage
      FROM funnel
      UNION ALL
      SELECT 
        'Customers' as stage,
        customers as count,
        CASE WHEN unique_callers > 0 
          THEN ROUND(customers::numeric / unique_callers * 100, 2) 
          ELSE 0 
        END as percentage
      FROM funnel
    `;

    return sequelize.query(query, {
      replacements: {
        companyId,
        start: dateRange.start,
        end: dateRange.end
      },
      type: QueryTypes.SELECT
    });
  }
}

export default new AnalyticsService();