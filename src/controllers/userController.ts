import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  address: z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres')
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  email: z.string().email().optional()
});

export class UserController {
  // Creates a new user
  static async create(req: Request, res: Response) {
    try {
      const validatedData = createUserSchema.parse(req.body);
      
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email já está em uso' });
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const user = await prisma.user.create({
        data: {
          ...validatedData,
          password: hashedPassword
        },
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Criar registro no timeline
      await prisma.userTimeline.create({
        data: {
          action: 'Usuário criado',
          userId: user.id,
          editedBy: user.name
        }
      });

      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // User login
  static async login(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const isPasswordValid = await bcrypt.compare(validatedData.password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      // Registrar login no timeline
      await prisma.userTimeline.create({
        data: {
          action: 'Login realizado',
          userId: user.id,
          editedBy: user.name
        }
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          address: user.address
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Gets all users
  static async getAll(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(users);
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Gets a user by ID
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          timeline: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

    // Updates a user by ID
  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updateUserSchema.parse(req.body);

      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (validatedData.email) {
        const existingUser = await prisma.user.findFirst({
          where: { 
            email: validatedData.email,
            NOT: { id }
          }
        });
        if (existingUser) {
          return res.status(400).json({ error: 'Email já está em uso' });
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: validatedData,
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Registrar atualização no timeline
      await prisma.userTimeline.create({
        data: {
          action: `Dados atualizados: ${Object.keys(validatedData).join(', ')}`,
          userId: id,
          editedBy: req.user?.name || 'Sistema'
        }
      });

      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Deletes a user by ID
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await prisma.user.delete({ where: { id } });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getTimeline(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const timeline = await prisma.userTimeline.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });

      const total = await prisma.userTimeline.count({
        where: { userId: id }
      });

      res.json({
        timeline,
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
}