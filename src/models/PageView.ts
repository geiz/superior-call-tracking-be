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
import Visitor from './Visitor';
import Company from './Company';

@Table({
  tableName: 'page_views',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export default class PageView extends Model<PageView> {
  @ForeignKey(() => Visitor)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  visitor_id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  page_url!: string;

  @Column(DataType.STRING(255))
  page_title?: string;

  @Column(DataType.STRING(500))
  referrer?: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  timestamp!: Date;

  @Column(DataType.INTEGER)
  time_on_page?: number;

  @Column(DataType.INTEGER)
  scroll_depth?: number;

  @Default(0)
  @Column(DataType.INTEGER)
  clicks!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  form_starts!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  form_completions!: number;

  @Column(DataType.STRING(100))
  utm_source?: string;

  @Column(DataType.STRING(100))
  utm_medium?: string;

  @Column(DataType.STRING(255))
  utm_campaign?: string;

  // Associations
  @BelongsTo(() => Visitor)
  visitor!: Visitor;

  @BelongsTo(() => Company)
  company!: Company;
}