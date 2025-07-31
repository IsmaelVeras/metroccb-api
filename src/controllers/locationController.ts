import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createLocationSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  address: z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
  distance: z.string().min(1, 'Distância é obrigatória'),
  stationId: z.string().uuid('ID da estação deve ser um UUID válido'),
  officialWorship: z.array(z.string()).default([]),
  youthMeeting: z.array(z.string()).default([])
});

const updateLocationSchema = createLocationSchema.partial().omit({ stationId: true });

export class LocationController {
  static async create(req: Request, res: Response) {
    try {
      const validatedData = createLocationSchema.parse(req.body);

      // Verificar se a estação existe
      const station = await prisma.station.findUnique({
        where: { id: validatedData.stationId }
      });

      if (!station) {
        return res.status(404).json({ error: 'Estação não encontrada' });
      }

      const location = await prisma.location.create({
        data: validatedData,
        include: {
          station: {
            select: {
              id: true,
              name: true,
              line: true,
              type: true
            }
          }
        }
      });

      res.status(201).json(location);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const { stationId, name } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (stationId) {
        where.stationId = stationId as string;
      }
      
      if (name) {
        where.name = { contains: name as string, mode: 'insensitive' };
      }

      const locations = await prisma.location.findMany({
        where,
        include: {
          station: {
            select: {
              id: true,
              name: true,
              line: true,
              type: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });

      const total = await prisma.location.count({ where });

      res.json({
        locations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const location = await prisma.location.findUnique({
        where: { id: parseInt(id) },
        include: {
          station: {
            select: {
              id: true,
              name: true,
              line: true,
              type: true,
              address: true
            }
          }
        }
      });

      if (!location) {
        return res.status(404).json({ error: 'Igreja não encontrada' });
      }

      res.json(location);
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updateLocationSchema.parse(req.body);

      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      const location = await prisma.location.findUnique({ 
        where: { id: parseInt(id) } 
      });
      
      if (!location) {
        return res.status(404).json({ error: 'Igreja não encontrada' });
      }

      const updatedLocation = await prisma.location.update({
        where: { id: parseInt(id) },
        data: validatedData,
        include: {
          station: {
            select: {
              id: true,
              name: true,
              line: true,
              type: true
            }
          }
        }
      });

      res.json(updatedLocation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const location = await prisma.location.findUnique({ 
        where: { id: parseInt(id) } 
      });
      
      if (!location) {
        return res.status(404).json({ error: 'Igreja não encontrada' });
      }

      await prisma.location.delete({ where: { id: parseInt(id) } });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getByStation(req: Request, res: Response) {
    try {
      const { stationId } = req.params;

      const station = await prisma.station.findUnique({
        where: { id: stationId },
        include: {
          churches: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!station) {
        return res.status(404).json({ error: 'Estação não encontrada' });
      }

      res.json({
        station: {
          id: station.id,
          name: station.name,
          line: station.line,
          type: station.type
        },
        churches: station.churches
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async search(req: Request, res: Response) {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.status(400).json({ error: 'Termo de busca deve ter pelo menos 2 caracteres' });
      }

      const locations = await prisma.location.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
            { station: { name: { contains: q, mode: 'insensitive' } } },
            { station: { line: { contains: q, mode: 'insensitive' } } }
          ]
        },
        include: {
          station: {
            select: {
              id: true,
              name: true,
              line: true,
              type: true
            }
          }
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      });

      res.json({ results: locations });
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}