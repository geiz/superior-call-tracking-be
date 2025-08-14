// backend/src/models/Tag.ts
import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  BelongsToMany,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt,
  Scopes
} from 'sequelize-typescript';
import Company from './Company';
import User from './User';
import Call from './Call';
import CallTag from './CallTag';

@Scopes(() => ({
  active: {
    where: { is_deleted: false }
  },
  deleted: {
    where: { is_deleted: true }
  }
}))
@Table({
  tableName: 'tags',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'name'],
      where: { is_deleted: false },
      name: 'unique_active_tag_name'
    },
    {
      fields: ['company_id', 'is_deleted']
    }
  ]
})
export default class Tag extends Model<Tag> {
  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  company_id!: number;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  name!: string;

  @Default('#3B82F6')
  @Column(DataType.STRING(7))
  color!: string;

  @Column(DataType.TEXT)
  description?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_auto_tag!: boolean;

  @Column(DataType.JSONB)
  auto_tag_rules?: any[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  is_deleted!: boolean;

  @Column(DataType.DATE)
  deleted_at?: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  created_by?: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  deleted_by?: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  created_at!: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  updated_at!: Date;

  // Virtual field for usage count
  @Column(DataType.VIRTUAL)
  usage_count?: number;

  // Associations
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, 'created_by')
  creator?: User;

  @BelongsTo(() => User, 'deleted_by')
  deletedByUser?: User;

  @BelongsToMany(() => Call, () => CallTag)
  calls!: Call[];

  // Instance methods - renamed to avoid conflict with Sequelize's restore
  async softDelete(userId: number): Promise<boolean> {
    try {
      this.is_deleted = true;
      this.deleted_at = new Date();
      this.deleted_by = userId;
      await this.save();
      return true;
    } catch (error) {
      console.error('Error soft deleting tag:', error);
      return false;
    }
  }

  async softRestore(): Promise<boolean> {
    try {
      this.is_deleted = false;
      // Set to undefined to clear the database field
      this.deleted_at = undefined;
      this.deleted_by = undefined;
      await this.save();
      return true;
    } catch (error) {
      console.error('Error restoring tag:', error);
      return false;
    }
  }

  // Check if tag can be assigned (not deleted)
  canBeAssigned(): boolean {
    return !this.is_deleted;
  }

  // Static methods
  static async findActiveByCompany(companyId: number): Promise<Tag[]> {
    return await this.scope('active').findAll({
      where: { company_id: companyId },
      order: [['name', 'ASC']]
    }) as Tag[];
  }

  static async findWithUsageCount(companyId: number, includeDeleted = false): Promise<Tag[]> {
    const sequelize = this.sequelize!;
    
    const where: any = { company_id: companyId };
    if (!includeDeleted) {
      where.is_deleted = false;
    }

    const tags = await this.findAll({
      where,
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(DISTINCT ct.call_id)
              FROM call_tags ct
              WHERE ct.tag_id = "Tag".id
            )`),
            'usage_count'
          ]
        ]
      },
      order: [['name', 'ASC']]
    });

    return tags as Tag[];
  }

  // Find or restore tag by name
  static async find(companyId: number, name: string, userId: number): Promise<Tag | null> {
    const tag = await this.findOne({
      where: {
        company_id: companyId,
        name: name.trim()
      }
    }) as Tag | null;

    return tag;
  }

  // Get usage count for this tag
  async getUsageCount(): Promise<number> {
    const count = await CallTag.count({
      where: { tag_id: this.id }
    });
    return count;
  }
}