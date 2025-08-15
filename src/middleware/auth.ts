import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../lib/prisma"

interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
  }
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token

  const authHeader = req.headers["authorization"]
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1]
  } else if (req.cookies?.token) {
    token = req.cookies.token
  }

  if (!token) {
    return res.status(401).json({ error: "Token de acesso requerido" })
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback-secret"
    ) as any

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(403).json({ error: "Token inválido" })
  }
}

export type { AuthRequest }
