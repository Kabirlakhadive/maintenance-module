import { Router, Request, Response } from 'express';
import { SystemInfoService } from './services/systemInfo';
import { DockerInfoService } from './services/dockerInfo';
import { ServerStatus, TrendData } from './types/telemetry';

const router = Router();
const systemService = SystemInfoService.getInstance();
const dockerService = DockerInfoService.getInstance();

// Helper to determine overall server status
const calculateStatus = (cpu: number, mem: number): 'healthy' | 'warning' | 'critical' => {
  if (cpu > 90 || mem > 90) return 'critical';
  if (cpu > 70 || mem > 80) return 'warning';
  return 'healthy';
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const [systemMetrics, dockerMetrics] = await Promise.all([
      systemService.getSystemMetrics(),
      dockerService.getDockerMetrics()
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
      environment: systemMetrics.data.environment
    };

    // Frontend expects an array of servers
    res.json([serverStatus]);
  } catch (error) {
    console.error('Error in /api/status:', error);
    res.status(500).json({ error: 'Failed to fetch server status' });
  }
});

router.get('/trends', async (req: Request, res: Response) => {
  // Mock trends for now since we don't have timeseries DB
  // Just return current values as the latest point
  // Ideally we would keep a circular buffer in memory
  try {
    const systemMetrics = await systemService.getSystemMetrics();

    const createTrend = (metric: string, value: number, unit: string): TrendData => ({
      metric,
      unit,
      data: Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (19 - i) * 60000).toISOString(),
        value: Math.max(0, value + (Math.random() * 10 - 5)) // Fake history around current value
      })),
      current: value,
      average: value,
      min: value - 5,
      max: value + 5
    });

    const trends: Record<string, TrendData> = {
      cpu: createTrend('CPU Utilization', systemMetrics.data.hardware.cpu.utilization_percent, '%'),
      memory: createTrend('Memory Usage', systemMetrics.data.hardware.memory.usage_percent, '%'),
      disk: createTrend('Disk Usage', systemMetrics.data.hardware.storage.devices[0]?.usage_percent || 0, '%'),
      network: createTrend('Network Traffic', (systemMetrics.data.hardware.network.interfaces[0]?.rx_bytes_per_sec || 0) / 1024 / 1024, 'MB/s')
    };

    res.json(trends);
  } catch (error) {
    console.error('Error in /api/trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

export default router;
