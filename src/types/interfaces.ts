import { UserRole } from './enums';
import { Visitor } from '../models';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  company_id: number;
  account_id?: string;
  session_id?: string;
}

export interface CallFlowConfig {
  record_calls: boolean;
  timeout_seconds: number;
  voicemail_enabled: boolean;
  voicemail_greeting: string;
  voicemail_transcribe: boolean;
}

export interface CompanySettings {
  caller_id_lookup: boolean;
  spam_detection: boolean;
  call_scoring: boolean;
}

export interface UserPreferences {
  notifications: {
    email: boolean;
    sms: boolean;
    desktop: boolean;
  };
  timezone: string | null;
}

export interface SipCallData {
  call_sid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  sip_call_id: string;
  timestamp: Date;
}

export interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface DateRangeQuery {
  date_from?: string;
  date_to?: string;
}

// backend/src/types/dni.types.ts

export interface DniConfig {
  companyId: number;
  dniEnabled: boolean;
  sessionDuration: number;
  assignmentStrategy: 'least_used' | 'round_robin' | 'sticky';
}

export interface VisitorSession {
  visitorId: string;
  companyId: number;
  assignedNumber: string | null;
  assignedAt: Date;
  sessionData: {
    createdAt: Date;
    pageViews: number;
    duration: number;
    lastActivity: Date;
  };
  visitorRecord?: Visitor; 
  attribution: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
    gclid?: string;
    fbclid?: string;
    msclkid?: string;
  };
  firstVisit: {
    timestamp: Date;
    landingPage: string;
    referrer?: string;
  };
  location?: {
    ipAddress: string;
    country?: string;
    region?: string;
    city?: string;
  };
  device?: {
    userAgent: string;
    deviceType?: string;
    browser?: string;
    os?: string;
  };
}

export interface CreateVisitorRequest {
  company_id: string;
  page_url: string;
  page_title?: string;
  referrer?: string;
  user_agent?: string;
  ip_address?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
}

export interface CreateVisitorResponse {
  visitor_id: string;
  assigned_number: string | null;
  session_duration: number;
}

export interface TrackPageViewRequest {
  visitor_id: string;
  company_id: string;
  page_url: string;
  page_title?: string;
  referrer?: string;
  timestamp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface TrackFormSubmissionRequest {
  visitor_id: string;
  company_id: string;
  form_id?: string;
  form_name?: string;
  page_url: string;
  fields: Record<string, any>;
}

export interface NumberPoolStats {
  total_pool_numbers: number;
  available_numbers: number;
  assigned_numbers: number;
  numbers: PoolNumber[];
}

export interface PoolNumber {
  id: number;
  phone_number: string;
  friendly_name?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  assigned_to_visitor_at: Date | null;
  last_assigned_at: Date | null;
  assignment_count: number;
  total_calls: number;
  is_available: boolean;
}

export interface NumberAssignment {
  visitor_id: number;
  tracking_number_id: number;
  assigned_at: Date;
  released_at?: Date;
  source?: string;
  medium?: string;
  campaign?: string;
}

export interface AvailablePoolNumber {
  tracking_number_id: number;
  phone_number: string;
  priority: number;
}