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
import { UserRole } from '../types/enums';
import User from './User';
import Company from './Company';

@Table({
  tableName: 'user_companies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'company_id']
    }
  ]
})
export default class UserCompany extends Model<UserCompany> {
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  user_id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @AllowNull(false)
  @Column(DataType.ENUM(...Object.values(UserRole)))
  role!: UserRole;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_default!: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Column(DataType.DATE)
  joined_at!: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  invited_by?: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Associations
  @BelongsTo(() => User, 'user_id')
  user!: User;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, 'invited_by')
  inviter?: User;
}