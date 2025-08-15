import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../lib/prisma"

// Interface para requisições autenticadas
export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
  }
}

// Interface para payload do JWT
interface JwtPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

// Tipos de erro de autenticação
enum AuthErrorType {
  NO_TOKEN = "NO_TOKEN",
  INVALID_TOKEN = "INVALID_TOKEN",
  EXPIRED_TOKEN = "EXPIRED_TOKEN",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  INVALID_SECRET = "INVALID_SECRET",
}

// Classe de erro personalizada para autenticação
class AuthenticationError extends Error {
  constructor(
    public type: AuthErrorType,
    message: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = "AuthenticationError"
  }
}

// Cache simples em memória para usuários (opcional, para reduzir queries)
const userCache = new Map<string, { user: any; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

// Utility function para extrair token
const extractToken = (req: Request): string | null => {
  // Prioridade: Bearer token > Cookie > Query parameter (menos seguro)
  const authHeader = req.headers["authorization"]

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7) // Remove "Bearer "
  }

  if (req.cookies?.token) {
    return req.cookies.token
  }

  // Fallback para query parameter (apenas em desenvolvimento)
  if (process.env.NODE_ENV === "development" && req.query.token) {
    return req.query.token as string
  }

  return null
}

// Utility function para validar JWT secret
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new AuthenticationError(
      AuthErrorType.INVALID_SECRET,
      "JWT_SECRET não configurado no servidor",
      500
    )
  }

  if (secret === "fallback-secret") {
    console.warn(
      "⚠️  AVISO: Usando JWT_SECRET padrão. Configure uma chave secreta segura!"
    )
  }

  return secret
}

// Utility function para buscar usuário com cache
const getUserById = async (userId: string): Promise<any | null> => {
  // Verificar cache primeiro
  const cached = userCache.get(userId)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.user
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        // Adicionar campo para verificar se usuário está ativo (se existir)
        // isActive: true
      },
    })

    // Atualizar cache se usuário encontrado
    if (user) {
      userCache.set(userId, { user, timestamp: Date.now() })
    }

    return user
  } catch (error) {
    console.error("Erro ao buscar usuário:", error)
    return null
  }
}

// Middleware principal de autenticação
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Extrair token
    const token = extractToken(req)

    if (!token) {
      throw new AuthenticationError(
        AuthErrorType.NO_TOKEN,
        "Token de acesso requerido"
      )
    }

    // 2. Validar JWT secret
    const jwtSecret = getJwtSecret()

    // 3. Verificar e decodificar token
    let decoded: JwtPayload
    try {
      decoded = jwt.verify(token, jwtSecret) as JwtPayload
    } catch (jwtError: any) {
      if (jwtError.name === "TokenExpiredError") {
        throw new AuthenticationError(
          AuthErrorType.EXPIRED_TOKEN,
          "Token expirado"
        )
      }

      throw new AuthenticationError(
        AuthErrorType.INVALID_TOKEN,
        "Token inválido"
      )
    }

    // 4. Validar payload
    if (!decoded.userId || !decoded.email) {
      throw new AuthenticationError(
        AuthErrorType.INVALID_TOKEN,
        "Token com payload inválido"
      )
    }

    // 5. Buscar usuário no banco
    const user = await getUserById(decoded.userId)

    if (!user) {
      // Limpar cache se usuário não encontrado
      userCache.delete(decoded.userId)

      throw new AuthenticationError(
        AuthErrorType.USER_NOT_FOUND,
        "Usuário não encontrado ou inativo"
      )
    }

    // 6. Verificar se email do token ainda é válido (caso usuário tenha mudado email)
    if (user.email !== decoded.email) {
      userCache.delete(decoded.userId)

      throw new AuthenticationError(
        AuthErrorType.INVALID_TOKEN,
        "Token inválido - dados do usuário alterados"
      )
    }

    // 7. Adicionar usuário à requisição
    req.user = user

    next()
  } catch (error) {
    // Log do erro para monitoramento
    if (error instanceof AuthenticationError) {
      console.warn(`Erro de autenticação [${error.type}]:`, {
        message: error.message,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
      })

      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.type,
      })
    }

    // Erro não esperado
    console.error("Erro inesperado na autenticação:", error)
    return res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      code: "INTERNAL_ERROR",
    })
  }
}

// Middleware opcional para rotas que podem ou não ter autenticação
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractToken(req)

  if (!token) {
    return next() // Continuar sem autenticação
  }

  try {
    const jwtSecret = getJwtSecret()
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload

    if (decoded.userId && decoded.email) {
      const user = await getUserById(decoded.userId)

      if (user && user.email === decoded.email) {
        req.user = user
      }
    }
  } catch (error) {
    // Silenciosamente ignorar erros no modo opcional
    console.warn("Token inválido ignorado em rota opcional:", error)
  }

  next()
}

// Middleware para verificar roles específicos (se implementado)
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Autenticação requerida",
        code: AuthErrorType.NO_TOKEN,
      })
    }

    // Assumindo que o usuário tem um campo 'role'
    const userRole = (req.user as any).role

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: "Permissão insuficiente",
        code: "INSUFFICIENT_PERMISSIONS",
      })
    }

    next()
  }
}

// Utility para limpar cache de usuário (chamar quando usuário for atualizado)
export const clearUserCache = (userId: string): void => {
  userCache.delete(userId)
}

// Utility para limpar todo cache
export const clearAllUserCache = (): void => {
  userCache.clear()
}

// Função para validar se token ainda é válido (sem fazer query no banco)
export const validateTokenOnly = (token: string): JwtPayload | null => {
  try {
    const jwtSecret = getJwtSecret()
    return jwt.verify(token, jwtSecret) as JwtPayload
  } catch {
    return null
  }
}

// Middleware para rate limiting por usuário autenticado
export const rateLimitByUser = (maxRequests: number, windowMs: number) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>()

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next() // Não aplicar rate limit se não autenticado
    }

    const userId = req.user.id
    const now = Date.now()
    const userLimit = userRequests.get(userId)

    if (!userLimit || now > userLimit.resetTime) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs })
      return next()
    }

    if (userLimit.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: "Muitas requisições. Tente novamente mais tarde.",
        code: "RATE_LIMIT_EXCEEDED",
      })
    }

    userLimit.count++
    next()
  }
}

// Exportar tipos e enums
export { AuthErrorType, AuthenticationError }
export type { JwtPayload }
