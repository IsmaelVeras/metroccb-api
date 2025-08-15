import { Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { z } from "zod"
import { AuthRequest } from "../middleware/auth"
import { prisma } from "../lib/prisma"

// Schemas de validação
const createUserSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .trim(),
  address: z
    .string()
    .min(5, "Endereço deve ter pelo menos 5 caracteres")
    .max(255, "Endereço deve ter no máximo 255 caracteres")
    .trim(),
  email: z.string().email("Email inválido").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Senha deve ter pelo menos 8 caracteres")
    .max(100, "Senha deve ter no máximo 100 caracteres")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Senha deve conter pelo menos uma letra minúscula, uma maiúscula e um número"
    ),
})

const loginSchema = z.object({
  email: z.string().email("Email inválido").toLowerCase().trim(),
  password: z.string().min(1, "Senha é obrigatória"),
})

const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .trim()
    .optional(),
  address: z
    .string()
    .min(5, "Endereço deve ter pelo menos 5 caracteres")
    .max(255, "Endereço deve ter no máximo 255 caracteres")
    .trim()
    .optional(),
  email: z.string().email("Email inválido").toLowerCase().trim().optional(),
})

const timelineQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
})

// Constantes
const JWT_EXPIRATION = "24h"
const BCRYPT_ROUNDS = 12
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 horas

// Tipos de resposta
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string | any[]
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export class UserController {
  // Utility method para criar timeline
  private static async createTimelineEntry(
    action: string,
    userId: string,
    editedBy: string
  ): Promise<void> {
    try {
      await prisma.userTimeline.create({
        data: {
          action,
          userId,
          editedBy,
        },
      })
    } catch (error) {
      console.error("Erro ao criar entrada no timeline:", error)
    }
  }

  // Utility method para gerar token JWT
  private static generateToken(userId: string, email: string): string {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error("JWT_SECRET não configurado")
    }

    return jwt.sign({ userId, email }, secret, { expiresIn: JWT_EXPIRATION })
  }

  // Utility method para configurar cookie
  private static setCookie(res: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === "production"

    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })
  }

  // Utility method para resposta padronizada
  private static sendResponse<T>(
    res: Response,
    status: number,
    success: boolean,
    data?: T,
    message?: string,
    error?: string | any[]
  ): Response {
    const response: ApiResponse<T> = { success }

    if (data !== undefined) response.data = data
    if (message) response.message = message
    if (error) response.error = error

    return res.status(status).json(response)
  }

  // Creates a new user
  static async create(req: Request, res: Response): Promise<Response> {
    try {
      const validatedData = createUserSchema.parse(req.body)

      // Verificar se email já existe
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      })

      if (existingUser) {
        return UserController.sendResponse(
          res,
          409,
          false,
          undefined,
          undefined,
          "Email já está em uso"
        )
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(
        validatedData.password,
        BCRYPT_ROUNDS
      )

      // Criar usuário em transação
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            ...validatedData,
            password: hashedPassword,
          },
          select: {
            id: true,
            name: true,
            address: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        // Criar entrada no timeline
        await tx.userTimeline.create({
          data: {
            action: "Usuário criado",
            userId: user.id,
            editedBy: user.name,
          },
        })

        return user
      })

      return UserController.sendResponse(
        res,
        201,
        true,
        result,
        "Usuário criado com sucesso"
      )
    } catch (error) {
      console.error("Erro ao criar usuário:", error)

      if (error instanceof z.ZodError) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          error.errors
        )
      }

      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // User login
  static async login(req: Request, res: Response): Promise<Response> {
    try {
      const validatedData = loginSchema.parse(req.body)

      const user = await prisma.user.findUnique({
        where: { email: validatedData.email },
      })

      if (!user) {
        return UserController.sendResponse(
          res,
          401,
          false,
          undefined,
          undefined,
          "Credenciais inválidas"
        )
      }

      const isPasswordValid = await bcrypt.compare(
        validatedData.password,
        user.password
      )

      if (!isPasswordValid) {
        return UserController.sendResponse(
          res,
          401,
          false,
          undefined,
          undefined,
          "Credenciais inválidas"
        )
      }

      // Gerar token e configurar cookie
      const token = UserController.generateToken(user.id, user.email)
      UserController.setCookie(res, token)

      // Registrar login no timeline (não aguardar para não atrasar resposta)
      UserController.createTimelineEntry("Login realizado", user.id, user.name)

      const userData = {
        id: user.id,
        name: user.name,
        email: user.email,
        address: user.address,
      }

      return UserController.sendResponse(
        res,
        200,
        true,
        userData,
        "Login realizado com sucesso"
      )
    } catch (error) {
      console.error("Erro no login:", error)

      if (error instanceof z.ZodError) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          error.errors
        )
      }

      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Logout
  static async logout(req: Request, res: Response): Promise<Response> {
    try {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
      })

      return UserController.sendResponse(
        res,
        200,
        true,
        undefined,
        "Logout realizado com sucesso"
      )
    } catch (error) {
      console.error("Erro no logout:", error)
      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Get my profile
  static async getProfile(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id

      if (!userId) {
        return UserController.sendResponse(
          res,
          401,
          false,
          undefined,
          undefined,
          "Usuário não autenticado"
        )
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          timeline: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      })

      if (!user) {
        return UserController.sendResponse(
          res,
          404,
          false,
          undefined,
          undefined,
          "Usuário não encontrado"
        )
      }

      return UserController.sendResponse(res, 200, true, user)
    } catch (error) {
      console.error("Erro ao buscar perfil:", error)
      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Gets all users
  static async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const { page, limit } = timelineQuerySchema.parse(req.query)
      const skip = (page - 1) * limit

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            name: true,
            address: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.user.count(),
      ])

      const response: PaginatedResponse<any> = {
        data: users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      }

      return UserController.sendResponse(res, 200, true, response)
    } catch (error) {
      console.error("Erro ao buscar usuários:", error)

      if (error instanceof z.ZodError) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          error.errors
        )
      }

      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Gets a user by ID
  static async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params

      if (!id) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          "ID é obrigatório"
        )
      }

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
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      })

      if (!user) {
        return UserController.sendResponse(
          res,
          404,
          false,
          undefined,
          undefined,
          "Usuário não encontrado"
        )
      }

      return UserController.sendResponse(res, 200, true, user)
    } catch (error) {
      console.error("Erro ao buscar usuário:", error)
      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Updates a user by ID
  static async update(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params

      if (!id) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          "ID é obrigatório"
        )
      }

      const validatedData = updateUserSchema.parse(req.body)

      if (Object.keys(validatedData).length === 0) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          "Nenhum campo para atualizar"
        )
      }

      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true },
      })

      if (!existingUser) {
        return UserController.sendResponse(
          res,
          404,
          false,
          undefined,
          undefined,
          "Usuário não encontrado"
        )
      }

      // Verificar se email já está em uso por outro usuário
      if (validatedData.email) {
        const emailInUse = await prisma.user.findFirst({
          where: {
            email: validatedData.email,
            NOT: { id },
          },
        })

        if (emailInUse) {
          return UserController.sendResponse(
            res,
            409,
            false,
            undefined,
            undefined,
            "Email já está em uso"
          )
        }
      }

      // Atualizar usuário em transação
      const result = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id },
          data: validatedData,
          select: {
            id: true,
            name: true,
            address: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        // Registrar atualização no timeline
        await tx.userTimeline.create({
          data: {
            action: `Dados atualizados: ${Object.keys(validatedData).join(
              ", "
            )}`,
            userId: id,
            editedBy: req.user?.name || "Sistema",
          },
        })

        return updatedUser
      })

      return UserController.sendResponse(
        res,
        200,
        true,
        result,
        "Usuário atualizado com sucesso"
      )
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error)

      if (error instanceof z.ZodError) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          error.errors
        )
      }

      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Deletes a user by ID
  static async delete(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { id } = req.params

      if (!id) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          "ID é obrigatório"
        )
      }

      // Verificar se usuário existe
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true },
      })

      if (!user) {
        return UserController.sendResponse(
          res,
          404,
          false,
          undefined,
          undefined,
          "Usuário não encontrado"
        )
      }

      // Deletar usuário (timeline será deletado por cascade)
      await prisma.user.delete({ where: { id } })

      return UserController.sendResponse(
        res,
        200,
        true,
        undefined,
        "Usuário deletado com sucesso"
      )
    } catch (error) {
      console.error("Erro ao deletar usuário:", error)
      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }

  // Get user timeline
  static async getTimeline(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params

      if (!id) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          "ID é obrigatório"
        )
      }

      const { page, limit } = timelineQuerySchema.parse(req.query)
      const skip = (page - 1) * limit

      // Verificar se usuário existe
      const userExists = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      })

      if (!userExists) {
        return UserController.sendResponse(
          res,
          404,
          false,
          undefined,
          undefined,
          "Usuário não encontrado"
        )
      }

      const [timeline, total] = await Promise.all([
        prisma.userTimeline.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.userTimeline.count({
          where: { userId: id },
        }),
      ])

      const response: PaginatedResponse<any> = {
        data: timeline,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      }

      return UserController.sendResponse(res, 200, true, response)
    } catch (error) {
      console.error("Erro ao buscar timeline:", error)

      if (error instanceof z.ZodError) {
        return UserController.sendResponse(
          res,
          400,
          false,
          undefined,
          undefined,
          error.errors
        )
      }

      return UserController.sendResponse(
        res,
        500,
        false,
        undefined,
        undefined,
        "Erro interno do servidor"
      )
    }
  }
}
