import { Account, Company, Call, TextMessage } from '../models';
import { Op } from 'sequelize';

export class UsageService {
  static async trackCallUsage(companyId: number): Promise<void> {
    const company = await Company.findByPk(companyId, {
      include: [Account]
    });
    
    if (!company || !company.account) return;
    
    // Check if usage needs reset (monthly)
    const now = new Date();
    const resetDate = new Date(company.usage_reset_at);
    
    if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
      await company.update({
        monthly_calls_used: 1,
        monthly_texts_used: 0,
        usage_reset_at: now
      });
    } else {
      await company.increment('monthly_calls_used');
    }
    
    // Check if limit exceeded
    if (company.monthly_calls_used >= company.account.monthly_call_limit) {
      // Send notification or block new calls
      console.warn(`Company ${companyId} exceeded call limit`);
    }
  }
  
  static async trackTextUsage(companyId: number): Promise<void> {
    // Similar to trackCallUsage but for texts
  }
  
  static async getUsageStats(accountId: number): Promise<any> {
    const account = await Account.findByPk(accountId, {
      include: [Company]
    });
    
    if (!account) return null;
    
    const totalCallsUsed = account.companies?.reduce((sum, c) => sum + c.monthly_calls_used, 0) || 0;
    const totalTextsUsed = account.companies?.reduce((sum, c) => sum + c.monthly_texts_used, 0) || 0;
    
    return {
      limits: {
        calls: account.monthly_call_limit,
        texts: account.monthly_text_limit,
        companies: account.max_companies,
        users_per_company: account.max_users_per_company
      },
      usage: {
        calls: totalCallsUsed,
        texts: totalTextsUsed,
        companies: account.companies?.length || 0
      },
      remaining: {
        calls: account.monthly_call_limit - totalCallsUsed,
        texts: account.monthly_text_limit - totalTextsUsed,
        companies: account.max_companies - (account.companies?.length || 0)
      }
    };
  }
}