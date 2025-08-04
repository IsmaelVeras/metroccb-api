"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    address: zod_1.z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
    email: zod_1.z.string().email('Email inválido'),
    password: zod_1.z.string().min(6, 'Senha deve ter pelo menos 6 caracteres')
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email inválido'),
    password: zod_1.z.string().min(1, 'Senha é obrigatória')
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    address: zod_1.z.string().min(5).optional(),
    email: zod_1.z.string().email().optional()
});
class UserController {
    static async create(req, res) {
        try {
            const validatedData = createUserSchema.parse(req.body);
            const existingUser = await prisma_1.prisma.user.findUnique({
                where: { email: validatedData.email }
            });
            if (existingUser) {
                return res.status(400).json({ error: 'Email já está em uso' });
            }
            const hashedPassword = await bcryptjs_1.default.hash(validatedData.password, 10);
            const user = await prisma_1.prisma.user.create({
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
            await prisma_1.prisma.userTimeline.create({
                data: {
                    action: 'Usuário criado',
                    userId: user.id,
                    editedBy: user.name
                }
            });
            res.status(201).json(user);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: error.errors });
            }
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async login(req, res) {
        try {
            const validatedData = loginSchema.parse(req.body);
            const user = await prisma_1.prisma.user.findUnique({
                where: { email: validatedData.email }
            });
            if (!user) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const isPasswordValid = await bcryptjs_1.default.compare(validatedData.password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '24h' });
            await prisma_1.prisma.userTimeline.create({
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
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: error.errors });
            }
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getAll(req, res) {
        try {
            const users = await prisma_1.prisma.user.findMany({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const user = await prisma_1.prisma.user.findUnique({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = updateUserSchema.parse(req.body);
            if (Object.keys(validatedData).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id } });
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            if (validatedData.email) {
                const existingUser = await prisma_1.prisma.user.findFirst({
                    where: {
                        email: validatedData.email,
                        NOT: { id }
                    }
                });
                if (existingUser) {
                    return res.status(400).json({ error: 'Email já está em uso' });
                }
            }
            const updatedUser = await prisma_1.prisma.user.update({
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
            await prisma_1.prisma.userTimeline.create({
                data: {
                    action: `Dados atualizados: ${Object.keys(validatedData).join(', ')}`,
                    userId: id,
                    editedBy: req.user?.name || 'Sistema'
                }
            });
            res.json(updatedUser);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({ error: error.errors });
            }
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const user = await prisma_1.prisma.user.findUnique({ where: { id } });
            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado' });
            }
            await prisma_1.prisma.user.delete({ where: { id } });
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getTimeline(req, res) {
        try {
            const { id } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const timeline = await prisma_1.prisma.userTimeline.findMany({
                where: { userId: id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            });
            const total = await prisma_1.prisma.userTimeline.count({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
}
exports.UserController = UserController;
