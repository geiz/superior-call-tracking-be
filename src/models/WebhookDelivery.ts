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
import { DeliveryStatus, WebhookEvent } from '../types/enums';
import Webhook from './Webhook';

@Table({
  tableName: 'webhook_deliveries',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class WebhookDelivery extends Model<WebhookDelivery> {
  @ForeignKey(() => Webhook)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  webhook_id!: number;

  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  delivery_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  event_type!: string;

  @Column(DataType.STRING(100))
  event_id?: string;

  @AllowNull(false)
  @Column(DataType.JSONB)
  payload!: Record<string, any>;

  @Column(DataType.JSONB)
  headers_sent?: Record<string, any>;

  @Default(1)
  @Column(DataType.INTEGER)
  attempt_number!: number;

  @Default(DeliveryStatus.PENDING)
  @Column(DataType.ENUM(...Object.values(DeliveryStatus)))
  status!: DeliveryStatus;

  @Column(DataType.DATE)
  request_sent_at?: Date;

  @Default('POST')
  @Column(DataType.STRING(10))
  request_method!: string;

  @Column(DataType.DATE)
  response_received_at?: Date;

  @Column(DataType.INTEGER)
  response_status_code?: number;

  @Column(DataType.JSONB)
  response_headers?: Record<string, any>;

  @Column(DataType.TEXT)
  response_body?: string;

  @Column(DataType.INTEGER)
  response_time_ms?: number;

  @Column(DataType.TEXT)
  error_message?: string;

  @Column(DataType.JSONB)
  error_details?: Record<string, any>;

  @Column(DataType.DATE)
  retry_after?: Date;

  @ForeignKey(() => WebhookDelivery)
  @Column(DataType.INTEGER)
  retried_from_id?: number;

  @Column(DataType.INET)
  ip_address?: string;

  @Column(DataType.INTEGER)
  dns_lookup_ms?: number;

  @Column(DataType.INTEGER)
  tcp_connect_ms?: number;

  @Column(DataType.INTEGER)
  tls_handshake_ms?: number;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  scheduled_at!: Date;

  // Associations
  @BelongsTo(() => Webhook)
  webhook!: Webhook;

  @BelongsTo(() => WebhookDelivery, 'retried_from_id')
  retried_from?: WebhookDelivery;

  // Methods
  markAsDelivered(responseCode: number, responseTime: number, responseBody?: string): void {
    this.status = DeliveryStatus.SUCCESS;
    this.response_status_code = responseCode;
    this.response_time_ms = responseTime;
    this.response_body = responseBody;
    this.response_received_at = new Date();
  }

  markAsFailed(error: string): void {
    this.status = DeliveryStatus.FAILED;
    this.error_message = error;
    
    if (this.attempt_number < 3) {
      this.status = DeliveryStatus.RETRY;
      const delayMinutes = Math.pow(2, this.attempt_number) * 5;
      this.retry_after = new Date(Date.now() + delayMinutes * 60 * 1000);
    }
  }

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;
}