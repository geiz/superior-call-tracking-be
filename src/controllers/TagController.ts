// backend/src/controllers/TagController.ts
import { Request, Response } from 'express';
import { Op, WhereOptions, Sequelize } from 'sequelize';
import Tag from '../models/Tag';
import Call from '../models/Call';
import CallTag from '../models/CallTag';
import { AuthRequest } from '../middleware/auth';

class TagController {
  async getTags(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { 
        search,
        include_deleted = 'false',
        with_usage = 'false',
        sort = 'name',
        order = 'ASC'
      } = req.query;

      const includeDeleted = include_deleted === 'true';
      const withUsage = with_usage === 'true';

      console.log('Getting tags for company:', req.user?.company_id); // Debug log

      if (withUsage) {
        try {
          const tags = await Tag.findWithUsageCount(
            req.user!.company_id, 
            includeDeleted
          );
          
          // Apply search filter if provided
          if (search) {
            const filtered = tags.filter(tag => 
              tag.name.toLowerCase().includes((search as string).toLowerCase())
            );
            res.json(filtered);
          } else {
            res.json(tags);
          }
        } catch (dbError) {
          console.error('Database error in findWithUsageCount:', dbError);
          // Fallback to simple query
          const simpleTags = await Tag.findAll({
            where: {
              company_id: req.user!.company_id,
              ...(includeDeleted ? {} : { is_deleted: false })
            }
          });
          res.json(simpleTags);
        }
      } else {
        const where: WhereOptions<Tag> = {
          company_id: req.user!.company_id
        };

        if (!includeDeleted) {
          where.is_deleted = false;
        }

        if (search) {
          where.name = { [Op.iLike]: `%${search}%` };
        }

        const tags = await Tag.findAll({
          where,
          order: [[sort as string, order as string]]
        });

        res.json(tags);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
      // Provide more detailed error info
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to fetch tags',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  }

  async getTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const tag = await Tag.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }

      res.json(tag);
    } catch (error) {
      console.error('Error fetching tag:', error);
      res.status(500).json({ error: 'Failed to fetch tag' });
    }
  }

  async createTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, color, description } = req.body;

      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Tag name is required' });
        return;
      }

      // Check if tag with same name exists (including deleted)
      const existingTag = await Tag.find(
        req.user!.company_id,
        name,
        req.user!.id
      );

      if (existingTag) {
        if (existingTag.is_deleted) {
          // Tag was restored, update its properties
          await existingTag.update({ 
            color: color || existingTag.color, 
            description,
            is_deleted: false,
            deleted_at: undefined,
            deleted_by: undefined
          });
          res.json({ 
            message: 'Tag restored and updated', 
            tag: existingTag 
          });
        } else {
          res.status(400).json({ error: 'Tag with this name already exists' });
        }
        return;
      }

      const tag = await Tag.create({
        company_id: req.user!.company_id,
        name: name.trim(),
        color: color || '#3B82F6',
        description,
        created_by: req.user!.id
      } as any);

      res.status(201).json(tag);
    } catch (error) {
      console.error('Error creating tag:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ 
        error: 'Failed to create tag',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  }

  async updateTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, color, description } = req.body;

      const tag = await Tag.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id,
          is_deleted: false
        }
      });

      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }

      // Don't allow name changes if another active tag has the same name
      if (name && name.trim() !== tag.name) {
        const duplicate = await Tag.findOne({
          where: {
            company_id: req.user!.company_id,
            name: name.trim(),
            is_deleted: false,
            id: { [Op.ne]: tag.id }
          }
        });

        if (duplicate) {
          res.status(400).json({ error: 'Another tag with this name already exists' });
          return;
        }
      }

      await tag.update({
        ...(name && { name: name.trim() }),
        ...(color && { color }),
        ...(description !== undefined && { description })
      });

      res.json(tag);
    } catch (error) {
      console.error('Error updating tag:', error);
      res.status(500).json({ error: 'Failed to update tag' });
    }
  }

  async deleteTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { force } = req.query;

      const tag = await Tag.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id
        }
      });

      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }

      if (tag.is_deleted && force !== 'true') {
        res.status(400).json({ error: 'Tag is already deleted' });
        return;
      }

      if (force === 'true') {
        // Check if tag is in use
        const usageCount = await CallTag.count({
          where: { tag_id: tag.id }
        });

        if (usageCount > 0) {
          res.status(400).json({ 
            error: 'Cannot permanently delete tag that is in use',
            usage_count: usageCount
          });
          return;
        }

        // Hard delete - completely remove
        await tag.destroy();
        res.json({ message: 'Tag permanently deleted' });
      } else {
        // Soft delete
        const success = await tag.softDelete(req.user!.id);
        if (success) {
          res.json({ message: 'Tag deleted', tag });
        } else {
          res.status(500).json({ error: 'Failed to delete tag' });
        }
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
      res.status(500).json({ error: 'Failed to delete tag' });
    }
  }

  async restoreTag(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const tag = await Tag.findOne({
        where: {
          id: parseInt(id),
          company_id: req.user!.company_id,
          is_deleted: true
        }
      });

      if (!tag) {
        res.status(404).json({ error: 'Deleted tag not found' });
        return;
      }

      const success = await tag.softRestore();
      if (success) {
        res.json({ message: 'Tag restored', tag });
      } else {
        res.status(500).json({ error: 'Failed to restore tag' });
      }
    } catch (error) {
      console.error('Error restoring tag:', error);
      res.status(500).json({ error: 'Failed to restore tag' });
    }
  }

  async bulkTagCalls(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { call_ids, tag_ids, action } = req.body;

      if (!call_ids || !Array.isArray(call_ids) || call_ids.length === 0) {
        res.status(400).json({ error: 'call_ids array is required' });
        return;
      }

      if (!tag_ids || !Array.isArray(tag_ids) || tag_ids.length === 0) {
        res.status(400).json({ error: 'tag_ids array is required' });
        return;
      }

      if (action === 'add') {
        const created = await CallTag.bulkAssignTags(
          call_ids, 
          tag_ids, 
          req.user!.id
        );
        
        res.json({ 
          message: 'Tags added successfully',
          relationships_created: created,
          calls_affected: call_ids.length,
          tags_added: tag_ids.length
        });
      } else if (action === 'remove') {
        const removed = await CallTag.bulkRemoveTags(call_ids, tag_ids);
        
        res.json({ 
          message: 'Tags removed successfully',
          relationships_removed: removed,
          calls_affected: call_ids.length
        });
      } else {
        res.status(400).json({ error: 'Invalid action. Use "add" or "remove"' });
      }
    } catch (error) {
      console.error('Error bulk tagging calls:', error);
      res.status(500).json({ error: 'Failed to bulk tag calls' });
    }
  }

  async searchCallsByTags(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tags, match = 'any' } = req.query;
      
      if (!tags) {
        res.status(400).json({ error: 'Tags parameter is required' });
        return;
      }

      const tagNames: string[] = Array.isArray(tags) 
        ? tags.map(t => String(t)) 
        : [String(tags)];

      // Find tag IDs from names
      const tagRecords = await Tag.findAll({
        where: {
          company_id: req.user!.company_id,
          name: { [Op.in]: tagNames as string[] },
          is_deleted: false
        },
        attributes: ['id', 'name']
      });

      if (tagRecords.length === 0) {
        res.json({ calls: [], message: 'No matching tags found' });
        return;
      }

      const tagIds = tagRecords.map(t => t.id);

      if (match === 'all') {
        // Find calls that have ALL specified tags
        const sequelize = Call.sequelize!;
        
        const calls = await Call.findAll({
          where: { company_id: req.user!.company_id },
          include: [{
            model: Tag,
            where: { id: { [Op.in]: tagIds } },
            through: { attributes: [] },
            attributes: ['id', 'name', 'color']
          }],
          group: ['Call.id'],
          having: sequelize.literal(`COUNT(DISTINCT "tags"."id") = ${tagIds.length}`)
        });

        res.json({ 
          calls, 
          match_type: 'all',
          tags_searched: tagRecords.map(t => t.name)
        });
      } else {
        // Find calls that have ANY of the specified tags
        const calls = await Call.findAll({
          where: { company_id: req.user!.company_id },
          include: [{
            model: Tag,
            where: { id: { [Op.in]: tagIds } },
            through: { attributes: [] },
            attributes: ['id', 'name', 'color']
          }]
        });

        res.json({ 
          calls, 
          match_type: 'any',
          tags_searched: tagRecords.map(t => t.name)
        });
      }
    } catch (error) {
      console.error('Error searching calls by tags:', error);
      res.status(500).json({ error: 'Failed to search calls by tags' });
    }
  }

  async getTagStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { include_deleted = 'false' } = req.query;
      const includeDeleted = include_deleted === 'true';

      const tags = await Tag.findWithUsageCount(
        req.user!.company_id,
        includeDeleted
      );

      // Sort by usage count descending
      tags.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));

      res.json({
        tags,
        summary: {
          total_tags: tags.length,
          active_tags: tags.filter(t => !t.is_deleted).length,
          deleted_tags: tags.filter(t => t.is_deleted).length,
          most_used: tags[0] || null
        }
      });
    } catch (error) {
      console.error('Error fetching tag stats:', error);
      res.status(500).json({ error: 'Failed to fetch tag stats' });
    }
  }
}

export default new TagController();