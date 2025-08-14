// backend/src/types/enums.ts
export enum UserRole {
  ADMIN = 'admin',                  // Full access to everything at company level
  MANAGER = 'manager',              // Manage numbers, calls, forms, messaging, reporting, integrations
  REPORTING = 'reporting',          // View reports, tag leads, place calls, send/receive messages
  AGENT = 'agent',                  // Place calls, send/receive messages
}

export enum CompanyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
  TRIAL = 'trial'
}

export enum PlanType {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

export enum CallStatus {
  RINGING = 'ringing',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BUSY = 'busy',
  NO_ANSWER = 'no_answer',
  CANCELED = 'canceled',
  VOICEMAIL = 'voicemail',
  MISSED = 'missed'
}

export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound'
}

export enum CallDisposition {
  NEW = 'new',
  ANSWERED = 'answered',
  ANSWERED_AI = 'answered_ai',
  VOICEMAIL = 'voicemail',
  ABANDONED = 'abandoned',
  BLOCKED = 'blocked',
  MISSED = 'missed'
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  UNQUALIFIED = 'unqualified',
  LOST = 'lost',
  CUSTOMER = 'customer'
}

export enum LifecycleStage {
  SUBSCRIBER = 'subscriber',
  LEAD = 'lead',
  OPPORTUNITY = 'opportunity',
  CUSTOMER = 'customer',
  EVANGELIST = 'evangelist'
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound'
}

export enum MessageStatus {
  QUEUED = 'queued',
  PENDING = 'pending',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  RECEIVED = 'received',
  READ = 'read'
}

export enum ConversationStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  SPAM = 'spam'
}

export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FAILED = 'failed'
}

export enum DeliveryStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRY = 'retry'
}

export enum AgentStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  AWAY = 'away',
  OFFLINE = 'offline',
  IN_CALL = 'in_call'
}

export enum WebhookEvent {
  CALL_STARTED = 'call.started',
  CALL_ANSWERED = 'call.answered',
  CALL_COMPLETED = 'call.completed',
  CALL_FAILED = 'call.failed',
  TEXT_RECEIVED = 'text.received',
  TEXT_SENT = 'text.sent',
  FORM_SUBMITTED = 'form.submitted',
  VOICEMAIL_RECEIVED = 'voicemail.received',
  RECORDING_READY = 'recording.ready',
  RECORDING_COMPLETED = 'RECORDING_COMPLETED'
}

export enum TrackingNumberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

export enum NumberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PORTING = 'porting',
  RELEASED = 'released'
}

export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
  PUSH = 'push'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete'
}