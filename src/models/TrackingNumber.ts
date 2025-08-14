import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
  Default,
  Unique,
  AllowNull,
  BeforeCreate,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import Company from './Company';
import Call from './Call';
import TextConversation from './TextConversation';
import Visitor from './Visitor';
interface CallFlowConfig {
  record_calls: boolean;
  timeout_seconds: number;
  voicemail_enabled: boolean;
  voicemail_greeting: string;
  voicemail_transcribe: boolean;
}

@Table({
  tableName: 'tracking_numbers',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class TrackingNumber extends Model<TrackingNumber> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

    // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => Call)
  calls!: Call[];

  @HasMany(() => TextConversation)
  text_conversations!: TextConversation[];

  @HasMany(() => Visitor) 
  visitors!: Visitor[];

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(20))
  phone_number!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  friendly_name!: string;

  @Column(DataType.TEXT)
  description?: string;

  @Default('local')
  @Column(DataType.STRING(50))
  type!: string;

  @Default('CA')
  @Column(DataType.STRING(2))
  country_code!: string;

  @Column(DataType.STRING(255))
  sip_uri?: string;

  // Source tracking
  @AllowNull(false)
  @Column(DataType.STRING(100))
  source!: string;

  @Column(DataType.STRING(100))
  medium?: string;

  @Column(DataType.STRING(255))
  campaign?: string;

  @Column(DataType.STRING(100))
  campaign_id?: string;

  // Call flow
  @Default({
    record_calls: true,
    timeout_seconds: 30,
    voicemail_enabled: true,
    voicemail_greeting: "Please leave a message after the beep.",
    voicemail_transcribe: true
  })
  @Column(DataType.JSONB)
  call_flow!: CallFlowConfig;

  // Provider details
  @Column(DataType.STRING(50))
  provider?: string;

  @Column(DataType.STRING(100))
  provider_sid?: string;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  monthly_fee!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 4))
  per_minute_rate!: number;

  // Status
  @Default('active')
  @Column(DataType.STRING(50))
  status!: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  verified!: boolean;

  @Column(DataType.DATE)
  verified_at?: Date;

  // SMS
  @Default(false)
  @Column(DataType.BOOLEAN)
  sms_enabled!: boolean;

  @Column(DataType.STRING(500))
  sms_webhook_url?: string;

  // Statistics
  @Default(0)
  @Column(DataType.INTEGER)
  total_calls!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_minutes!: number;

  @Column(DataType.DATE)
  last_call_at?: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_pool_number!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_default!: boolean;

  @Column(DataType.DATE)
  assigned_to_visitor_at?: Date;

  @Column(DataType.DATE)
  last_assigned_at?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  assignment_count!: number;

  // Generate SIP URI before creating
  @BeforeCreate
  static async generateSipUri(instance: TrackingNumber) {
    if (!instance.sip_uri && instance.company_id) {
      const company = await Company.findByPk(instance.company_id);
      if (company) {
        const extension = instance.phone_number.slice(-4);
        instance.sip_uri = company.generateSipUri(extension);
      }
    }
  }
}