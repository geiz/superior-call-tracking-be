import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export const generateCallSid = (): string => {
  return `CALL_${Date.now()}_${uuidv4().split('-')[0]}`;
};

export const generateSessionId = (): string => {
  return `SESSION_${Date.now()}_${uuidv4()}`;
};

export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Add +1 if it's a US number without country code
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // Add + if missing
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  
  return cleaned;
};

export const calculateCallCost = (duration: number, ratePerMinute: number): number => {
  const minutes = Math.ceil(duration / 60);
  return minutes * ratePerMinute;
};

export const generateWebhookSignature = (secret: string, payload: string): string => {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
};