import Docker from "dockerode";
import {
  ServiceMetrics,
  SystemdService,
  WebService,
  DatabaseService,
} from "../types/telemetry";

export class DockerInfoService {
  private static instance: DockerInfoService;
  private docker: Docker;

  private constructor() {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
  }

  // Helper to check if docker is available to prevent crashes
  private async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (e) {
      return false;
    }
  }

  public static getInstance(): DockerInfoService {
    if (!DockerInfoService.instance) {
      DockerInfoService.instance = new DockerInfoService();
    }
    return DockerInfoService.instance;
  }

  public async getDockerMetrics(): Promise<ServiceMetrics> {
    try {
      if (!(await this.isDockerAvailable())) {
        return {
          systemd_services: {
            total_services: 0,
            active_services: 0,
            failed_services: 0,
            critical_services: [],
          },
          web_services: [],
          database_services: [],
        };
      }
      const containers = await this.docker.listContainers({ all: true });

      const systemd_services = this.mapContainersToSystemdServices(containers);
      const web_services = this.mapContainersToWebServices(containers);
      const database_services =
        this.mapContainersToDatabaseServices(containers);

      return {
        systemd_services,
        web_services,
        database_services,
      };
    } catch (error) {
      console.error("Error fetching Docker metrics:", error);
      return {
        systemd_services: {
          total_services: 0,
          active_services: 0,
          failed_services: 0,
          critical_services: [],
        },
        web_services: [],
        database_services: [],
      };
    }
  }

  private mapContainersToSystemdServices(containers: Docker.ContainerInfo[]): {
    total_services: number;
    active_services: number;
    failed_services: number;
    critical_services: SystemdService[];
  } {
    const total_services = containers.length;
    const active_services = containers.filter(
      (c) => c.State === "running"
    ).length;
    const failed_services = containers.filter(
      (c) => c.State === "exited" && c.Status.includes("Exit (1)")
    ).length; // Rough check

    const critical_services: SystemdService[] = containers.map((c) => ({
      name: c.Names[0].replace("/", ""),
      status:
        c.State === "running"
          ? "active"
          : c.State === "exited"
          ? "failed"
          : "inactive",
      uptime_seconds: this.parseUptime(c.Status),
      restart_count: 0, // Not easily available in listContainers, requires inspect
    }));

    return {
      total_services,
      active_services,
      failed_services,
      critical_services,
    };
  }

  private mapContainersToWebServices(
    containers: Docker.ContainerInfo[]
  ): WebService[] {
    // Filter for common web containers or labels
    return containers
      .filter(
        (c) =>
          c.Image.includes("nginx") ||
          c.Image.includes("apache") ||
          c.Image.includes("node") ||
          c.Ports.some((p) => p.PublicPort === 80 || p.PublicPort === 443)
      )
      .map((c) => ({
        name: c.Names[0].replace("/", ""),
        url: `http://localhost:${c.Ports[0]?.PublicPort || 80}`,
        status_code: c.State === "running" ? 200 : 503,
        response_time_ms: 0,
        ssl_expiry_days: 999,
        certificate_valid: true,
      }));
  }

  private mapContainersToDatabaseServices(
    containers: Docker.ContainerInfo[]
  ): DatabaseService[] {
    const dbTypes = ["postgresql", "mysql", "mongodb", "redis", "mariadb"];

    return containers
      .filter((c) => dbTypes.some((t) => c.Image.includes(t)))
      .map((c) => {
        const type =
          (dbTypes.find((t) => c.Image.includes(t)) as any) || "postgresql";
        return {
          type,
          version: "latest", // Need inspect for ImageID -> tag
          connections: {
            active: 0, // Requires direct DB query
            idle: 0,
            max_allowed: 100,
          },
          replication_lag_seconds: 0,
          slow_queries_per_minute: 0,
        };
      });
  }

  private parseUptime(status: string): number {
    // "Up 2 hours", "Up 3 days"
    if (!status.startsWith("Up")) return 0;

    // Simplistic parser
    if (status.includes("hours")) return parseInt(status.split(" ")[1]) * 3600;
    if (status.includes("days")) return parseInt(status.split(" ")[1]) * 86400;
    if (status.includes("minutes")) return parseInt(status.split(" ")[1]) * 60;
    if (status.includes("seconds")) return parseInt(status.split(" ")[1]);
    return 0;
  }
}
