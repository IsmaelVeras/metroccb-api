import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { StationType } from '../../lib/generated/prisma';

const createStationSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  line: z.string().min(1, 'Linha é obrigatória'),
  type: z.nativeEnum(StationType, { errorMap: () => ({ message: 'Tipo de estação inválido' }) }),
  address: z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
  openingHours: z.string().min(1, 'Horário de funcionamento é obrigatório'),
  accessibility: z.array(z.string()).default([])
});

const updateStationSchema = createStationSchema.partial();

export class StationController {
  static async create(req: Request, res: Response) {
    try {
      const validatedData = createStationSchema.parse(req.body);

      const station = await prisma.station.create({
        data: validatedData,
        include: {
          churches: true
        }
      });

      res.status(201).json(station);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getAll(req: Request, res: Response) {
    try {
      const { type, line } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const where: any = {};
      
      if (type && Object.values(StationType).includes(type as StationType)) {
        where.type = type;
      }
      
      if (line) {
        where.line = { contains: line as string, mode: 'insensitive' };
      }

      const stations = await prisma.station.findMany({
        where,
        include: {
          churches: true,
          _count: {
            select: { churches: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });

      const total = await prisma.station.count({ where });

      res.json({
        stations,
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

      const station = await prisma.station.findUnique({
        where: { id },
        include: {
          churches: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!station) {
        return res.status(404).json({ error: 'Estação não encontrada' });
      }

      res.json(station);
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updateStationSchema.parse(req.body);

      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      const station = await prisma.station.findUnique({ where: { id } });
      if (!station) {
        return res.status(404).json({ error: 'Estação não encontrada' });
      }

      const updatedStation = await prisma.station.update({
        where: { id },
        data: validatedData,
        include: {
          churches: true
        }
      });

      res.json(updatedStation);
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

      const station = await prisma.station.findUnique({ where: { id } });
      if (!station) {
        return res.status(404).json({ error: 'Estação não encontrada' });
      }

      await prisma.station.delete({ where: { id } });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getTypes(req: Request, res: Response) {
    try {
      const types = Object.values(StationType);
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getStats(req: Request, res: Response) {
    try {
      const stats = await prisma.station.groupBy({
        by: ['type'],
        _count: {
          id: true
        }
      });

      const totalStations = await prisma.station.count();
      const totalChurches = await prisma.location.count();

      res.json({
        totalStations,
        totalChurches,
        stationsByType: stats.map(stat => ({
          type: stat.type,
          count: stat._count.id
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}