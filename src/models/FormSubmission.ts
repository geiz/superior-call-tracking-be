import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  Default,
  AllowNull,
  CreatedAt
} from 'sequelize-typescript';
import Company from './Company';
import Visitor from './Visitor';
import User from './User';

@Table({
  tableName: 'form_submissions',
  timestamps: true,
  underscored: true
})
export default class FormSubmission extends Model {
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

  @ForeignKey(() => Visitor)
  @Column(DataType.INTEGER)
  visitor_id?: number;

  @Column(DataType.STRING(100))
  form_id?: string;

  @Column(DataType.STRING(255))
  form_name?: string;

  @Column(DataType.STRING(500))
  page_url?: string;

  @AllowNull(false)
  @Column(DataType.JSONB)
  fields!: Record<string, any>;

  // Extracted contact fields for easy querying
  @Column(DataType.STRING(255))
  name?: string;

  @Column(DataType.STRING(255))
  email?: string;

  @Column(DataType.STRING(20))
  phone?: string;

  @Column(DataType.STRING(255))
  company?: string;

  // Attribution fields
  @Column(DataType.STRING(100))
  source?: string;

  @Column(DataType.STRING(100))
  medium?: string;

  @Column(DataType.STRING(255))
  campaign?: string;

  // Click IDs for tracking
  @Column(DataType.STRING(255))
  gclid?: string;

  @Column(DataType.STRING(255))
  fbclid?: string;

  // Status tracking
  @Default('new')
  @Column(DataType.STRING(50))
  status!: string; // new, contacted, qualified, unqualified

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  assigned_to?: number;

  @AllowNull(false)
  @Column(DataType.DATE)
  submitted_at!: Date;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  // Associations
  @BelongsTo(() => Company)
  company_relation!: Company;

  @BelongsTo(() => Visitor)
  visitor?: Visitor;

  @BelongsTo(() => User, 'assigned_to')
  assigned_user?: User;

  // Helper methods
  getFieldValue(fieldName: string): any {
    return this.fields[fieldName];
  }

  hasField(fieldName: string): boolean {
    return fieldName in this.fields;
  }

  getContactInfo(): { name?: string; email?: string; phone?: string; company?: string } {
    return {
      name: this.name,
      email: this.email,
      phone: this.phone,
      company: this.company
    };
  }

  isQualified(): boolean {
    return this.status === 'qualified';
  }

  hasAttribution(): boolean {
    return !!(this.source || this.medium || this.campaign || this.gclid || this.fbclid);
  }
}