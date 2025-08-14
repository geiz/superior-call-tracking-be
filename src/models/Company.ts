import {
  Table,
  Column,
  Model,
  DataType,
  HasMany,
  Default,
  Unique,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  BeforeCreate,
  ForeignKey,
  BelongsTo
} from 'sequelize-typescript';
import { CompanyStatus } from '../types/enums';
import User from './User';
import TrackingNumber from './TrackingNumber';
import Call from './Call';
import Tag from './Tag';
import Webhook from './Webhook';
import TextConversation from './TextConversation';
import CustomerProfile from './CustomerProfile';
import Account from './Account';


interface CompanySettings {
  caller_id_lookup: boolean;
  spam_detection: boolean;
  call_scoring: boolean;
  api_key?: string;
}

@Table({
  tableName: 'companies',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class Company extends Model<Company> {

  @ForeignKey(() => Account)
  @Column(DataType.INTEGER)
  account_id?: number;

  // Associations
  @BelongsTo(() => Account)
  account?: Account;


  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @Unique
  @Column(DataType.STRING(100))
  subdomain?: string;

  @Default('America/New_York')
  @Column(DataType.STRING(50))
  timezone!: string;

  // SIP Configuration
  @AllowNull(false)
  @Column(DataType.STRING(255))
  sip_domain!: string;

  @Column(DataType.STRING(100))
  sip_username?: string;

  @Column(DataType.STRING(255))
  sip_password?: string;

  @Default('UDP')
  @Column(DataType.STRING(10))
  sip_transport!: string;

  @Default(5060)
  @Column(DataType.INTEGER)
  sip_port!: number;

  // Call Flow Defaults
  @Default(30)
  @Column(DataType.INTEGER)
  default_timeout_seconds!: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  voicemail_enabled!: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  voicemail_transcription!: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  recording_enabled!: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  recording_disclaimer!: boolean;

  @Default({
    caller_id_lookup: true,
    spam_detection: true,
    call_scoring: true
  })
  @Column(DataType.JSONB)
  settings!: CompanySettings;

  @Default('starter')
  @Column(DataType.STRING(50))
  plan_type!: string;

  @Column(DataType.STRING(255))
  billing_email?: string;

  @Default(1000)
  @Column(DataType.INTEGER)
  monthly_minutes_limit!: number;

  @Default(500)
  @Column(DataType.INTEGER)
  monthly_texts_limit!: number;

  @Default(CompanyStatus.ACTIVE)
  @Column({
    type: DataType.ENUM(...Object.values(CompanyStatus)),
    field: 'status'
  })  
  status!: CompanyStatus;

  @Column(DataType.DATE)
  trial_ends_at?: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @HasMany(() => User)
  users!: User[];

  @HasMany(() => TrackingNumber)
  tracking_numbers!: TrackingNumber[];

  @HasMany(() => Call)
  calls!: Call[];

  @HasMany(() => Tag)
  tags!: Tag[];

  @HasMany(() => Webhook)
  webhooks!: Webhook[];

  @HasMany(() => TextConversation)
  text_conversations!: TextConversation[];

  @HasMany(() => CustomerProfile)
  customer_profiles!: CustomerProfile[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  dni_enabled!: boolean;

  @Default(60)
  @Column(DataType.INTEGER)
  dni_session_duration!: number;

  @Default('least_used')
  @Column(DataType.STRING(50))
  dni_assignment_strategy!: string;

  // Helper methods
  generateSipUri(extension: string): string {
    return '14378861145@sip.ringostat.com';
  }

  isInTrial(): boolean {
    return this.status === CompanyStatus.TRIAL && 
           this.trial_ends_at ? this.trial_ends_at > new Date() : false;
  }
}