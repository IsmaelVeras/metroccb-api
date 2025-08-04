"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'https://metroccb-api.onrender.com/api',
    credentials: true
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: 'Muitas tentativas. Tente novamente em 15 minutos.'
    }
});
app.use('/api', limiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api', routes_1.default);
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});
app.use((error, req, res, next) => {
    console.error('Error:', error);
    if (error.code === 'P2002') {
        return res.status(400).json({
            error: 'Violação de restrição única no banco de dados'
        });
    }
    if (error.code === 'P2025') {
        return res.status(404).json({
            error: 'Registro não encontrado'
        });
    }
    res.status(500).json({
        error: 'Erro interno do servidor'
    });
});
app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta: ${port}`);
    console.log(`📊 Health check: ${port}/health`);
    console.log(`📚 API base URL: ${port}/api`);
});
