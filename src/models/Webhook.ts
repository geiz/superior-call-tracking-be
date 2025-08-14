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
import { WebhookStatus } from '../types/enums';
import Company from './Company';
import WebhookDelivery from './WebhookDelivery';

@Table({
  tableName: 'webhooks',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class Webhook extends Model<Webhook> {
  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  url!: string;

  @AllowNull(false)
  @Column(DataType.ARRAY(DataType.TEXT))
  events!: string[];

  @Column(DataType.STRING(50))
  auth_type?: string;

  @Column(DataType.TEXT)
  auth_credentials?: string;

  @Column(DataType.STRING(255))
  signing_secret?: string;

  @Default({})
  @Column(DataType.JSONB)
  custom_headers!: Record<string, string>;

  @Default(WebhookStatus.ACTIVE)
  @Column(DataType.ENUM(...Object.values(WebhookStatus)))
  status!: WebhookStatus;

  @Default(true)
  @Column(DataType.BOOLEAN)
  retry_on_failure!: boolean;

  @Default(3)
  @Column(DataType.INTEGER)
  max_retries!: number;

  @Default(60)
  @Column(DataType.INTEGER)
  retry_delay_seconds!: number;

  @Default(30)
  @Column(DataType.INTEGER)
  timeout_seconds!: number;

  @Default(60)
  @Column(DataType.INTEGER)
  rate_limit_per_minute!: number;

  @Column(DataType.DATE)
  last_triggered_at?: Date;

  @Column(DataType.INTEGER)
  last_status_code?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  consecutive_failures!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  total_deliveries!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  successful_deliveries!: number;

  @Default(5)
  @Column(DataType.INTEGER)
  circuit_breaker_threshold!: number;

  @Default(300)
  @Column(DataType.INTEGER)
  circuit_breaker_reset_after!: number;

  @Column(DataType.DATE)
  circuit_opened_at?: Date | null;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => WebhookDelivery)
  deliveries!: WebhookDelivery[];

  // Methods
  isCircuitOpen(): boolean {
    if (!this.circuit_opened_at) return false;
    
    const resetTime = new Date(this.circuit_opened_at.getTime() + this.circuit_breaker_reset_after * 1000);
    return new Date() < resetTime;
  }

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;
}