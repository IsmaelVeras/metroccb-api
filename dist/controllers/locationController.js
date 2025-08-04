"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationController = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const createLocationSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    address: zod_1.z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
    distance: zod_1.z.string().min(1, 'Distância é obrigatória'),
    stationId: zod_1.z.string().uuid('ID da estação deve ser um UUID válido'),
    officialWorship: zod_1.z.array(zod_1.z.string()).default([]),
    youthMeeting: zod_1.z.array(zod_1.z.string()).default([])
});
const updateLocationSchema = createLocationSchema.partial().omit({ stationId: true });
class LocationController {
    static async create(req, res) {
        try {
            const validatedData = createLocationSchema.parse(req.body);
            const station = await prisma_1.prisma.station.findUnique({
                where: { id: validatedData.stationId }
            });
            if (!station) {
                return res.status(404).json({ error: 'Estação não encontrada' });
            }
            const location = await prisma_1.prisma.location.create({
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
            const { stationId, name } = req.query;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const where = {};
            if (stationId) {
                where.stationId = stationId;
            }
            if (name) {
                where.name = { contains: name, mode: 'insensitive' };
            }
            const locations = await prisma_1.prisma.location.findMany({
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
            const total = await prisma_1.prisma.location.count({ where });
            res.json({
                locations,
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
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const location = await prisma_1.prisma.location.findUnique({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = updateLocationSchema.parse(req.body);
            if (Object.keys(validatedData).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }
            const location = await prisma_1.prisma.location.findUnique({
                where: { id: parseInt(id) }
            });
            if (!location) {
                return res.status(404).json({ error: 'Igreja não encontrada' });
            }
            const updatedLocation = await prisma_1.prisma.location.update({
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
            const location = await prisma_1.prisma.location.findUnique({
                where: { id: parseInt(id) }
            });
            if (!location) {
                return res.status(404).json({ error: 'Igreja não encontrada' });
            }
            await prisma_1.prisma.location.delete({ where: { id: parseInt(id) } });
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getByStation(req, res) {
        try {
            const { stationId } = req.params;
            const station = await prisma_1.prisma.station.findUnique({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async search(req, res) {
        try {
            const { q } = req.query;
            if (!q || typeof q !== 'string' || q.trim().length < 2) {
                return res.status(400).json({ error: 'Termo de busca deve ter pelo menos 2 caracteres' });
            }
            const locations = await prisma_1.prisma.location.findMany({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
}
exports.LocationController = LocationController;
