import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  Default,
  AllowNull
} from 'sequelize-typescript';
import Company from './Company';
import Call from './Call';

@Table({
  tableName: 'sip_events',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: false // SIP events are immutable
})
export default class SipEvent extends Model<SipEvent> {
  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @ForeignKey(() => Call)
  @Column(DataType.INTEGER)
  call_id?: number;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  event_type!: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  event_timestamp!: Date;

  @AllowNull(false)
  @Column(DataType.JSONB)
  event_data!: Record<string, any>;

  @Column(DataType.STRING(100))
  sip_call_id?: string;

  @Column(DataType.STRING(255))
  from_uri?: string;

  @Column(DataType.STRING(255))
  to_uri?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  processed!: boolean;

  @Column(DataType.DATE)
  processed_at?: Date;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => Call)
  call?: Call;

  // Methods
  async markAsProcessed(): Promise<void> {
    this.processed = true;
    this.processed_at = new Date();
    await this.save();
  }

  isIncoming(): boolean {
    return this.event_type === 'incoming_call' || 
           this.event_type === 'invite';
  }

  isOutgoing(): boolean {
    return this.event_type === 'outgoing_call';
  }

  isAnswer(): boolean {
    return this.event_type === 'answer' || 
           this.event_type === 'call_answered';
  }

  isHangup(): boolean {
    return this.event_type === 'hangup' || 
           this.event_type === 'call_completed' ||
           this.event_type === 'bye';
  }
}