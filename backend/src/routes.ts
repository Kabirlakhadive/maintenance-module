import { Router, Request, Response } from "express";
import { SystemInfoService } from "./services/systemInfo";
import { DockerInfoService } from "./services/dockerInfo";
import { ServerStatus, TrendData } from "./types/telemetry";

const router = Router();
const systemService = SystemInfoService.getInstance();
const dockerService = DockerInfoService.getInstance();

// Helper to determine overall server status
const calculateStatus = (
  cpu: number,
  mem: number
): "healthy" | "warning" | "critical" => {
  if (cpu > 90 || mem > 90) return "critical";
  if (cpu > 70 || mem > 80) return "warning";
  return "healthy";
};

router.get("/status", async (req: Request, res: Response) => {
  try {
    const [systemMetrics, dockerMetrics] = await Promise.all([
      systemService.getSystemMetrics(),
      dockerService.getDockerMetrics(),
    ]);

    // Merge Docker metrics into system metrics
    systemMetrics.data.hardware.services = dockerMetrics;
    systemMetrics.data.services = dockerMetrics;

    const cpuUtil = systemMetrics.data.hardware.cpu.utilization_percent;
    const memUtil = systemMetrics.data.hardware.memory.usage_percent;
    const status = calculateStatus(cpuUtil, memUtil);

    const serverStatus: ServerStatus = {
      hostname: systemMetrics.meta.hostname,
      status: status,
      server_type: systemMetrics.meta.server_type,
      os_distribution: systemMetrics.meta.os_distribution,
      hardware: systemMetrics.data.hardware,
      alerts: systemMetrics.data.alerts,
      environment: systemMetrics.data.environment,
    };

    // Frontend expects an array of servers
    res.json([serverStatus]);
  } catch (error) {
    console.error("Error in /api/status:", error);
    res.status(500).json({ error: "Failed to fetch server status" });
  }
});

router.get("/trends", async (req: Request, res: Response) => {
  try {
    // Get collected trends from memory buffer
    const trends = systemService.getTrends();
    res.json(trends);
  } catch (error) {
    console.error("Error in /api/trends:", error);
    res.status(500).json({ error: "Failed to fetch trends" });
  }
});

export default router;
