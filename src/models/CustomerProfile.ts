// backend/src/models/CustomerProfile.ts
import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import { LeadStatus, LifecycleStage } from '../types/enums';
import Company from './Company';

@Table({
  tableName: 'customer_profiles',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'phone_number']
    },
    {
      unique: true,
      fields: ['company_id', 'email']
    }
  ]
})
export default class CustomerProfile extends Model<CustomerProfile> {
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

  @Column(DataType.STRING(20))
  phone_number?: string;

  @Column(DataType.STRING(255))
  email?: string;

  @Column(DataType.STRING(100))
  first_name?: string;

  @Column(DataType.STRING(100))
  last_name?: string;

  @Column(DataType.STRING(255))
  company?: string;

  @Column(DataType.STRING(100))
  city?: string;

  @Column(DataType.STRING(50))
  state?: string;

  @Column(DataType.STRING(50))
  country?: string;

  @Column(DataType.STRING(50))
  timezone?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  lead_score!: number;

  @Default(LeadStatus.NEW)
  @Column(DataType.ENUM(...Object.values(LeadStatus)))
  lead_status!: LeadStatus;

  @Default(LifecycleStage.SUBSCRIBER)
  @Column(DataType.ENUM(...Object.values(LifecycleStage)))
  lifecycle_stage!: LifecycleStage;

  @Column(DataType.DATE)
  first_contact_at?: Date;

  @Column(DataType.DATE)
  last_contact_at?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  total_calls!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_minutes!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_texts!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_forms!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_page_views!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  lifetime_value!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  total_revenue!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  average_order_value!: number;

  @Column(DataType.STRING(100))
  acquisition_source?: string;

  @Column(DataType.STRING(100))
  acquisition_medium?: string;

  @Column(DataType.STRING(255))
  acquisition_campaign?: string;

  @Column(DataType.DATEONLY)
  acquisition_date?: Date;

  @Default({})
  @Column(DataType.JSONB)
  custom_fields!: Record<string, any>;

  @Column(DataType.STRING(100))
  crm_id?: string;

  @Column(DataType.DATE)
  last_call_at?: Date;

  @Default({})
  @Column(DataType.JSONB)
  external_ids!: Record<string, any>;

  // Associations
  @BelongsTo(() => Company)
  company_rel!: Company;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Virtual field for full name
  get full_name(): string {
    return `${this.first_name || ''} ${this.last_name || ''}`.trim();
  }
}