// backend/src/models/Call.ts - Complete fixed version

import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasOne,
  BelongsToMany,
  HasMany,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  Unique,
  AfterCreate
} from 'sequelize-typescript';
import { Op } from 'sequelize';
import { CallStatus, CallDirection, CallDisposition, LeadStatus } from '../types/enums';
import Company from './Company';
import TrackingNumber from './TrackingNumber';
import User from './User';
import AgentSession from './AgentSession';
import CallRecording from './CallRecording';
import Tag from './Tag';
import CallTag from './CallTag';
import SipEvent from './SipEvent';
import Visitor from './Visitor';

@Table({
  tableName: 'calls',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class Call extends Model<Call> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(100))
  call_sid!: string;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @ForeignKey(() => TrackingNumber)
  @Column(DataType.INTEGER)
  tracking_number_id?: number;

  // Caller information
  @AllowNull(false)
  @Column(DataType.STRING(20))
  caller_number!: string;

  @Column(DataType.STRING(255))
  caller_name?: string;

  @Column(DataType.STRING(100))
  caller_city?: string;

  @Column(DataType.STRING(50))
  caller_state?: string;

  @Column(DataType.STRING(50))
  caller_country?: string;

  @Column(DataType.STRING(20))
  caller_zip?: string;

  @Column(DataType.DECIMAL(10, 8))
  latitude?: number;

  @Column(DataType.DECIMAL(11, 8))
  longitude?: number;

  // Call details
  @Column(DataType.STRING(20))
  destination_number?: string;

  @Column(DataType.STRING(20))
  forwarding_number?: string;

  // Timing
  @AllowNull(false)
  @Column(DataType.DATE)
  start_time!: Date;

  @Column(DataType.DATE)
  answer_time?: Date;

  @Column(DataType.DATE)
  end_time?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  duration!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  talk_time!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  ring_time!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  hold_time!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  queue_time!: number;

  // Status
  @Default(CallDirection.INBOUND)
  @Column(DataType.ENUM(...Object.values(CallDirection)))
  direction!: CallDirection;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(CallStatus)))
  status!: CallStatus;

  @Column(DataType.ENUM(...Object.values(CallDisposition)))
  disposition?: CallDisposition;

  @Column(DataType.STRING(100))
  hangup_cause?: string;

  // Agent handling
  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  agent_id?: number;

  @ForeignKey(() => AgentSession)
  @Column(DataType.INTEGER)
  agent_session_id?: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  assigned_to?: number;
  
  // Lead tracking
  @Default(false)
  @Column(DataType.BOOLEAN)
  is_first_call!: boolean;

  @ForeignKey(() => Call)
  @Column(DataType.INTEGER)
  first_call_id?: number;

  @Column(DataType.ENUM(...Object.values(LeadStatus)))
  lead_status?: LeadStatus;

  @Column(DataType.INTEGER)
  lead_score?: number;

  // Call value
  @Default(false)
  @Column(DataType.BOOLEAN)
  has_value!: boolean;

  @Column(DataType.DECIMAL(10, 2))
  value?: number;

  @Column(DataType.DECIMAL(10, 2))
  revenue?: number;

  // Recording
  @Default(true)
  @Column(DataType.BOOLEAN)
  recording_enabled!: boolean;

  @Column(DataType.STRING(500))
  recording_url?: string;

  @Column(DataType.STRING(500))
  recording_key?: string;

  @Column(DataType.INTEGER)
  recording_duration?: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  transcription_enabled!: boolean;

  @Column(DataType.STRING(50))
  transcription_status?: string;

  @Column(DataType.TEXT)
  transcription?: string;

  @Column(DataType.DECIMAL(3, 2))
  transcription_confidence?: number;

  // AI Analysis
  @Column(DataType.STRING(20))
  sentiment?: string;

  @Column(DataType.DECIMAL(3, 2))
  sentiment_score?: number;

  @Column(DataType.DECIMAL(3, 2))
  talk_to_listen_ratio?: number;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  keywords_detected!: string[];

  // Quality
  @Column(DataType.INTEGER)
  call_quality_score?: number;

  @Column(DataType.STRING(50))
  audio_quality?: string;

  // SIP details
  @Column(DataType.STRING(255))
  sip_call_id?: string;

  @Column(DataType.STRING(255))
  sip_from_uri?: string;

  @Column(DataType.STRING(255))
  sip_to_uri?: string;

  @Column(DataType.STRING(50))
  codec?: string;

  // Spam detection
  @Default(false)
  @Column(DataType.BOOLEAN)
  is_spam!: boolean;

  @Column(DataType.DECIMAL(3, 2))
  spam_score?: number;

  // Voicemail
  @Column(DataType.STRING(500))
  voicemail_url?: string;

  // Source tracking
  @Column(DataType.STRING(100))
  source?: string;

  @Column(DataType.STRING(100))
  medium?: string;

  @Column(DataType.STRING(255))
  campaign?: string;

  @Column(DataType.STRING(255))
  keyword?: string;

  @Column(DataType.STRING(500))
  landing_page?: string;

  @Column(DataType.STRING(500))
  referrer?: string;

  @Column(DataType.STRING(255))
  gclid?: string;

  @Column(DataType.STRING(255))
  fbclid?: string;

  @Column(DataType.STRING(255))
  msclkid?: string;

  @Column(DataType.UUID)
  visitor_id?: string;

  // Additional fields
  @Column(DataType.TEXT)
  notes?: string;

  @Default({})
  @Column(DataType.JSONB)
  custom_fields!: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, any>;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @CreatedAt
  @Column(DataType.DATE)
  submitted_at?: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => Visitor, 'visitor_id')
  visitor?: Visitor;

  @BelongsTo(() => TrackingNumber)
  tracking_number?: TrackingNumber;

  @BelongsTo(() => User, 'agent_id')
  agent?: User;

  @BelongsTo(() => User, 'assigned_to')
  assigned_user?: User;

  @BelongsTo(() => AgentSession)
  agent_session?: AgentSession;

  @BelongsTo(() => Call, 'first_call_id')
  first_call?: Call;

  @HasOne(() => CallRecording)
  recording?: CallRecording;

  @BelongsToMany(() => Tag, () => CallTag)
  tags!: Tag[];

  @HasMany(() => SipEvent)
  sip_events!: SipEvent[];

  // Methods
  async addTags(tagIds: number[]): Promise<void> {
    if (tagIds && tagIds.length > 0) {
      await this.$set('tags', tagIds);
      await this.reload({ include: ['tags'] });
    }
  }

  async removeTag(tagId: number): Promise<void> {
    await this.$remove('tags', tagId);
  }

  isCompleted(): boolean {
    return this.status === CallStatus.COMPLETED;
  }

  isMissed(): boolean {
    return [CallStatus.NO_ANSWER, CallStatus.BUSY, CallStatus.CANCELED, CallStatus.MISSED].includes(this.status);
  }

  isAnswered(): boolean {
    return this.status === CallStatus.COMPLETED && this.talk_time > 0;
  }

  // Hooks
  @AfterCreate
  static async afterCreateHook(call: Call) {
    // Update tracking number stats
    if (call.tracking_number_id) {
      await TrackingNumber.update(
        { 
          last_call_at: call.start_time,
          total_calls: call.sequelize.literal('total_calls + 1')
        },
        { where: { id: call.tracking_number_id } }
      );
    }

    // Check if this is a first-time caller
    if (call.company_id && call.caller_number) {
      const previousCalls = await Call.count({
        where: {
          company_id: call.company_id,
          caller_number: call.caller_number,
          id: { [Op.lt]: call.id }
        }
      });
      
      if (previousCalls === 0) {
        await call.update({ is_first_call: true });
      }
    }
  }
}