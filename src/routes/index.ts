import { Router } from "express"
import { UserController } from "../controllers/userController"
import { StationController } from "../controllers/stationController"
import { LocationController } from "../controllers/locationController"
import { authenticateToken } from "../middleware/auth"

const router = Router()

// Routes públicas
router.post("/auth/register", UserController.create)
router.post("/auth/login", UserController.login)

// Routes de usuários
router.get("/profile", authenticateToken, UserController.getProfile)

router.get("/users", authenticateToken, UserController.getAll)
router.get("/users/:id", authenticateToken, UserController.getById)
router.put("/users/:id", authenticateToken, UserController.update)
router.delete("/users/:id", authenticateToken, UserController.delete)
router.get("/users/:id/timeline", authenticateToken, UserController.getTimeline)

// Routes de estações
router.post("/stations", authenticateToken, StationController.create)
router.get("/stations", StationController.getAll)
router.get("/stations/types", StationController.getTypes)
router.get("/stations/stats", StationController.getStats)
router.get("/stations/:id", StationController.getById)
router.put("/stations/:id", authenticateToken, StationController.update)
router.delete("/stations/:id", authenticateToken, StationController.delete)

// Routes de igrejas/localizações
router.post("/locations", authenticateToken, LocationController.create)
router.get("/locations", LocationController.getAll)
router.get("/locations/search", LocationController.search)
router.get("/locations/:id", LocationController.getById)
router.put("/locations/:id", authenticateToken, LocationController.update)
router.delete("/locations/:id", authenticateToken, LocationController.delete)
router.get("/stations/:stationId/locations", LocationController.getByStation)

export default router
