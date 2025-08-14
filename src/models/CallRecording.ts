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
import Call from './Call';
import Company from './Company';

@Table({
  tableName: 'call_recordings',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class CallRecording extends Model<CallRecording> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    unique: true,
    allowNull: false
  })
  uuid!: string;

  @ForeignKey(() => Call)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  call_id!: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  company_id?: number;

  @Column(DataType.STRING(100))
  recording_sid?: string;

  // File storage - both are optional since Twilio provides URLs
  @Column(DataType.STRING(500))
  file_path?: string;

  @Column(DataType.STRING(500))
  file_url?: string;

  @Column(DataType.BIGINT)
  file_size?: number;

  @Column(DataType.INTEGER)
  duration?: number;

  @Default('mp3')
  @Column(DataType.STRING(20))
  format!: string;

  @Default(1)
  @Column(DataType.INTEGER)
  channels?: number;

  @Default(16000)
  @Column(DataType.INTEGER)
  sample_rate?: number;

  @Default(128)
  @Column(DataType.INTEGER)
  bit_rate?: number;

  @Column(DataType.JSONB)
  waveform_data?: any;

  @Column(DataType.TEXT)
  transcription_text?: string;

  @Column(DataType.STRING(100))
  transcription_job_id?: string;

  @Default('twilio')
  @Column(DataType.STRING(50))
  storage_provider!: string;

  @Column(DataType.STRING(255))
  storage_bucket?: string;

  @Column(DataType.STRING(500))
  storage_key?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  encrypted!: boolean;

  @Column(DataType.STRING(255))
  encryption_key?: string;

  @Default(90)
  @Column(DataType.INTEGER)
  retention_days?: number;

  @Column(DataType.DATE)
  delete_after?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  archived?: boolean;

  @Column(DataType.DATE)
  archived_at?: Date;

  @Default('completed')
  @Column(DataType.STRING(50))
  status?: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // Timestamps
  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => Call)
  call!: Call;

  @BelongsTo(() => Company)
  company!: Company;

  // Helper methods
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isArchived(): boolean {
    return this.archived === true;
  }

  getFullUrl(): string {
    // For Twilio recordings, the URL is already complete
    if (this.storage_provider === 'twilio' && this.file_url) {
      return this.file_url;
    }
    
    // For local or other storage, might need to construct URL
    if (this.file_url) {
      return this.file_url;
    }

    // Fallback to constructing from path
    if (this.file_path) {
      return `${process.env.BASE_URL}/recordings/${this.uuid}.${this.format}`;
    }

    return '';
  }

  shouldBeDeleted(): boolean {
    if (!this.delete_after) return false;
    return new Date() > this.delete_after;
  }

  async archive(): Promise<void> {
    this.archived = true;
    this.archived_at = new Date();
    await this.save();
  }
}