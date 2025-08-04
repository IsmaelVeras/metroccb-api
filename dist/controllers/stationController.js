"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StationController = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const prisma_2 = require("../../prisma/generated/prisma");
const createStationSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    line: zod_1.z.string().min(1, 'Linha é obrigatória'),
    type: zod_1.z.nativeEnum(prisma_2.StationType, { errorMap: () => ({ message: 'Tipo de estação inválido' }) }),
    address: zod_1.z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
    openingHours: zod_1.z.string().min(1, 'Horário de funcionamento é obrigatório'),
    accessibility: zod_1.z.array(zod_1.z.string()).default([])
});
const updateStationSchema = createStationSchema.partial();
class StationController {
    static async create(req, res) {
        try {
            const validatedData = createStationSchema.parse(req.body);
            const station = await prisma_1.prisma.station.create({
                data: validatedData,
                include: {
                    churches: true
                }
            });
            res.status(201).json(station);
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
            const { type, line } = req.query;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const where = {};
            if (type && Object.values(prisma_2.StationType).includes(type)) {
                where.type = type;
            }
            if (line) {
                where.line = { contains: line, mode: 'insensitive' };
            }
            const stations = await prisma_1.prisma.station.findMany({
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
            const total = await prisma_1.prisma.station.count({ where });
            res.json({
                stations,
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
            const station = await prisma_1.prisma.station.findUnique({
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
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async update(req, res) {
        try {
            const { id } = req.params;
            const validatedData = updateStationSchema.parse(req.body);
            if (Object.keys(validatedData).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }
            const station = await prisma_1.prisma.station.findUnique({ where: { id } });
            if (!station) {
                return res.status(404).json({ error: 'Estação não encontrada' });
            }
            const updatedStation = await prisma_1.prisma.station.update({
                where: { id },
                data: validatedData,
                include: {
                    churches: true
                }
            });
            res.json(updatedStation);
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
            const station = await prisma_1.prisma.station.findUnique({ where: { id } });
            if (!station) {
                return res.status(404).json({ error: 'Estação não encontrada' });
            }
            await prisma_1.prisma.station.delete({ where: { id } });
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getTypes(req, res) {
        try {
            const types = Object.values(prisma_2.StationType);
            res.json(types);
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    static async getStats(req, res) {
        try {
            const stats = await prisma_1.prisma.station.groupBy({
                by: ['type'],
                _count: {
                    id: true
                }
            });
            const totalStations = await prisma_1.prisma.station.count();
            const totalChurches = await prisma_1.prisma.location.count();
            res.json({
                totalStations,
                totalChurches,
                stationsByType: stats.map(stat => ({
                    type: stat.type,
                    count: stat._count.id
                }))
            });
        }
        catch (error) {
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
}
exports.StationController = StationController;
