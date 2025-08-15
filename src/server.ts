import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import compression from "compression"
import cookieParser from "cookie-parser"
import morgan from "morgan"
import { randomBytes } from "crypto"
import routes from "./routes"

const app = express()
const port = process.env.PORT || 4000
const isProduction = process.env.NODE_ENV === "production"
const isDevelopment = process.env.NODE_ENV === "development"

// Função para validar variáveis de ambiente obrigatórias
const validateEnvironment = (): void => {
  const required = ["JWT_SECRET"]
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error("❌ Variáveis de ambiente obrigatórias não configuradas:")
    missing.forEach((key) => console.error(`   - ${key}`))
    process.exit(1)
  }

  if (process.env.JWT_SECRET === "fallback-secret") {
    console.warn(
      "⚠️  AVISO: Usando JWT_SECRET padrão. Configure uma chave segura!"
    )
  }
}

// Função para configurar CORS dinamicamente
const configureCors = () => {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:3000", // React dev
    "http://localhost:5173", // Vite dev
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ].filter(Boolean) // Remove valores undefined/null

  if (isProduction && process.env.ADDITIONAL_ORIGINS) {
    allowedOrigins.push(...process.env.ADDITIONAL_ORIGINS.split(","))
  }

  return cors({
    origin: (origin, callback) => {
      // Permitir requests sem origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      // Em desenvolvimento, ser mais permissivo
      if (isDevelopment) {
        return callback(null, true)
      }

      callback(new Error(`CORS: Origin ${origin} não permitida`))
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "X-API-Key",
    ],
    exposedHeaders: ["X-Total-Count", "X-Page-Count"],
    maxAge: 86400, // 24 horas para preflight cache
  })
}

// Configurar rate limiting com diferentes limites
const createRateLimiter = (
  windowMs: number,
  max: number,
  skipSuccessfulRequests = false
) => {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    message: {
      success: false,
      error: "Muitas tentativas. Tente novamente mais tarde.",
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    skip: (req) => {
      // Pular rate limit para health check
      return req.path === "/health"
    },
  })
}

// Middleware de logs customizado
const createLogger = () => {
  if (isDevelopment) {
    return morgan("dev")
  }

  return morgan("combined", {
    skip: (req) => req.path === "/health", // Não logar health checks
  })
}

// Middleware para adicionar request ID
const addRequestId = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const requestId = randomBytes(16).toString("hex")
  req.headers["x-request-id"] = requestId
  res.setHeader("X-Request-ID", requestId)
  next()
}

// Middleware para headers de segurança customizados
const securityHeaders = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  res.setHeader("X-API-Version", "1.0")
  res.setHeader("X-Powered-By", "MetroCCB API")

  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    )
  }

  next()
}

// Validar ambiente na inicialização
validateEnvironment()

// Request ID para rastreamento
app.use(addRequestId)

// Logging
app.use(createLogger())

// Middlewares de segurança
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Pode causar problemas com CORS
  })
)

app.use(securityHeaders)

// CORS
app.use(configureCors())

// Compressão
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false
      }
      return compression.filter(req, res)
    },
    level: 6, // Balanço entre compressão e CPU
  })
)

// Rate limiting com diferentes limites por rota
const generalLimiter = createRateLimiter(15 * 60 * 1000, 1000) // 1000 req/15min geral
const authLimiter = createRateLimiter(15 * 60 * 1000, 50, true) // 50 req/15min para auth
const strictLimiter = createRateLimiter(60 * 1000, 10) // 10 req/1min para rotas sensíveis

app.use("/api", generalLimiter)
app.use("/api/auth", authLimiter)
app.use("/api/admin", strictLimiter) // Assumindo rotas admin

// Cookie parser (necessário para auth)
app.use(cookieParser())

// Body parsers
app.use(
  express.json({
    limit: "10mb",
    type: ["application/json", "text/plain"],
  })
)
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
)

// Trust proxy (importante para rate limiting e IPs corretos)
if (isProduction) {
  app.set("trust proxy", 1)
}

// Routes
app.use("/api", routes)

// Health check expandido
app.get("/health", (req, res) => {
  const healthData = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || "1.0.0",
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
    },
  }

  res.json(healthData)
})

// Endpoint para informações da API
app.get("/api/info", (req, res) => {
  res.json({
    name: "MetroCCB API",
    version: process.env.APP_VERSION || "1.0.0",
    environment: process.env.NODE_ENV,
    documentation: process.env.API_DOCS_URL || "/api/docs",
    timestamp: new Date().toISOString(),
  })
})

// Middleware para capturar métricas básicas (opcional)
const metricsMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const start = Date.now()

  res.on("finish", () => {
    const duration = Date.now() - start

    // Aqui você pode enviar métricas para um serviço de monitoramento
    if (duration > 1000) {
      // Log requests lentos
      console.warn(`Slow request: ${req.method} ${req.path} - ${duration}ms`)
    }
  })

  next()
}

app.use(metricsMiddleware)

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Rota não encontrada",
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  })
})

// Error handler global melhorado
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const requestId = req.headers["x-request-id"]

    // Log detalhado do erro
    console.error(`Error [${requestId}]:`, {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    })

    // Diferentes tipos de erro do Prisma
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "Violação de restrição única",
        code: "UNIQUE_CONSTRAINT_VIOLATION",
        requestId,
      })
    }

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: "Registro não encontrado",
        code: "RECORD_NOT_FOUND",
        requestId,
      })
    }

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        error: "Violação de chave estrangeira",
        code: "FOREIGN_KEY_VIOLATION",
        requestId,
      })
    }

    // Erro de validação
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Dados inválidos",
        details: error.details || error.message,
        code: "VALIDATION_ERROR",
        requestId,
      })
    }

    // CORS error
    if (error.message?.includes("CORS")) {
      return res.status(403).json({
        success: false,
        error: "CORS: Origin não permitida",
        code: "CORS_ERROR",
        requestId,
      })
    }

    // Erro genérico
    const statusCode = error.statusCode || error.status || 500
    const message =
      isProduction && statusCode === 500
        ? "Erro interno do servidor"
        : error.message

    res.status(statusCode).json({
      success: false,
      error: message,
      code: error.code || "INTERNAL_ERROR",
      requestId,
      ...(isDevelopment && { stack: error.stack }),
    })
  }
)

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n📴 Recebido ${signal}. Iniciando graceful shutdown...`)

  const server = app.listen(port)

  server.close((err) => {
    if (err) {
      console.error("❌ Erro durante shutdown:", err)
      process.exit(1)
    }

    console.log("✅ Servidor fechado graciosamente")
    process.exit(0)
  })

  // Forçar shutdown após 10 segundos
  setTimeout(() => {
    console.error("❌ Forçando shutdown após timeout")
    process.exit(1)
  }, 10000)
}

// Handlers para sinais de sistema
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

// Handler para erros não capturados
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  // Em produção, você pode querer reiniciar o processo
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  process.exit(1)
})

// Inicializar servidor
const server = app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta: ${port}`)
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV}`)
  console.log(`📊 Health check: http://localhost:${port}/health`)
  console.log(`📚 API base URL: http://localhost:${port}/api`)
  console.log(`📖 API info: http://localhost:${port}/api/info`)

  if (isDevelopment) {
    console.log(`🔧 Modo desenvolvimento ativo`)
  }
})

// Configurar timeout do servidor
server.keepAliveTimeout = 65000
server.headersTimeout = 66000

export default app
