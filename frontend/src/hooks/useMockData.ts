import { useState, useEffect, useCallback } from "react";
import { ServerStatus, TrendData } from "../types/telemetry";

export const useMockData = () => {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [trends, setTrends] = useState<Record<string, TrendData>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // Don't set loading to true on every poll to avoid UI flicker
    // only on initial load or if manual refresh is triggered and loading is explicitly desired
    // But since this is called by setInterval, we shouldn't flicker.
    // We handle initial loading state separately if needed.

    try {
      const [statusRes, trendsRes] = await Promise.all([
        fetch("api/status"),
        fetch("api/trends"),
      ]);

      if (!statusRes.ok || !trendsRes.ok) {
        throw new Error("Failed to fetch data from backend");
      }

      const serverData: ServerStatus[] = await statusRes.json();
      const trendData: Record<string, TrendData> = await trendsRes.json();

      setServers(serverData);
      setTrends(trendData);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      console.error("Error fetching telemetry:", err);
      setError(err.message);
      // Optional: keep old data or clear it? Keeping old data is usually better.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const refreshData = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Calculate summary statistics
  const healthyServers = servers.filter((s) => s.status === "healthy").length;
  const warningServers = servers.filter((s) => s.status === "warning").length;
  const criticalServers = servers.filter((s) => s.status === "critical").length;
  const totalServers = servers.length;

  const healthScore =
    totalServers > 0 ? Math.round((healthyServers / totalServers) * 100) : 0;

  const avgCPU =
    servers.length > 0
      ? Math.round(
          servers.reduce(
            (sum, s) => sum + s.hardware.cpu.utilization_percent,
            0
          ) / servers.length
        )
      : 0;

  const avgMemory =
    servers.length > 0
      ? Math.round(
          servers.reduce((sum, s) => sum + s.hardware.memory.usage_percent, 0) /
            servers.length
        )
      : 0;

  const totalAlerts = servers.reduce(
    (sum, s) => sum + s.alerts.filter((a) => !a.resolved).length,
    0
  );

  return {
    servers,
    trends,
    loading,
    error,
    lastUpdate,
    refreshData,
    // Summary stats
    stats: {
      healthScore,
      healthyServers,
      warningServers,
      criticalServers,
      totalServers,
      avgCPU,
      avgMemory,
      totalAlerts,
    },
  };
};
