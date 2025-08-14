import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  HasMany,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from 'sequelize-typescript';
import Company from './Company';
import PageView from './PageView';
import FormSubmission from './FormSubmission';
import TrackingNumber from './TrackingNumber';

@Table({
  tableName: 'visitors',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'visitor_id']
    }
  ]
})
export default class Visitor extends Model<Visitor> {
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

  @AllowNull(false)
  @Column(DataType.STRING(100))
  visitor_id!: string;

  @Column(DataType.STRING(20))
  phone_number?: string;

  @Column(DataType.STRING(255))
  email?: string;

  @ForeignKey(() => Visitor)
  @Column(DataType.INTEGER)
  merged_with_id?: number;

  @AllowNull(false)
  @Column(DataType.DATE)
  first_visit_at!: Date;

  @Column(DataType.STRING(100))
  first_source?: string;

  @Column(DataType.STRING(100))
  first_medium?: string;

  @Column(DataType.STRING(255))
  first_campaign?: string;

  @Column(DataType.STRING(500))
  first_landing_page?: string;

  @Column(DataType.INET)
  ip_address?: string;

  @Column(DataType.STRING(50))
  country?: string;

  @Column(DataType.STRING(100))
  region?: string;

  @Column(DataType.STRING(100))
  city?: string;

  @Column(DataType.TEXT)
  user_agent?: string;

  @Column(DataType.STRING(50))
  device_type?: string;

  @Column(DataType.STRING(50))
  browser?: string;

  @Column(DataType.STRING(50))
  os?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  page_views!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_time_on_site!: number;

  @Column(DataType.DATE)
  last_visit_at?: Date;

  // DNI fields
  @Column(DataType.STRING(20))
  assigned_number?: string;

  @ForeignKey(() => TrackingNumber)
  @Column(DataType.INTEGER)
  tracking_number_id?: number;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  assigned_at!: Date;

  @Default({})
  @Column(DataType.JSONB)
  session_data!: Record<string, any>;

  @Column(DataType.STRING(255))
  gclid?: string;

  @Column(DataType.STRING(255))
  fbclid?: string;

  @Column(DataType.STRING(255))
  msclkid?: string;

  @Column(DataType.STRING(255))
  first_term?: string;

  @Column(DataType.STRING(255))
  first_content?: string;

  @Column(DataType.STRING(500))
  first_referrer?: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => TrackingNumber)
  tracking_number?: TrackingNumber;

  @BelongsTo(() => Visitor, 'merged_with_id')
  merged_with?: Visitor;

  @HasMany(() => PageView)
  page_view_records!: PageView[];

  @HasMany(() => FormSubmission)
  form_submissions!: FormSubmission[];
}