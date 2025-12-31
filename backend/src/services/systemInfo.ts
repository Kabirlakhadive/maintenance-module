import si from "systeminformation";
import {
  CPUMetrics,
  MemoryMetrics,
  StorageMetrics,
  NetworkMetrics,
  HardwareHealth,
  StorageDevice,
  NetworkInterface,
  FanData,
  ServerMetadata,
  TelemetryData,
  TrendData,
} from "../types/telemetry";

import { TrueNASConnector } from "./TrueNASConnector";

export class SystemInfoService {
  private static instance: SystemInfoService;
  private trueNASConnector: TrueNASConnector | null = null;

  // Cache current metrics
  private currentMetrics: TelemetryData | null = null;
  private isCollecting: boolean = false;

  private constructor() {
    // Initialize TrueNAS connector if env vars are present
    const truenasHost = process.env.TRUENAS_HOST || "192.168.24.88";
    const truenasToken =
      process.env.TRUENAS_TOKEN ||
      "jM-xT4E8Vy65LUUIe6U45rMOgVUIf9hEAwzEqts6BuC2Vo611S9x-uRrynxBEppp";

    if (truenasHost && truenasToken) {
      this.trueNASConnector = new TrueNASConnector({
        host: truenasHost,
        token: truenasToken,
      });
      this.trueNASConnector.connect();
    }

    // Start background collection loop
    this.startCollectionLoop();
  }

  public static getInstance(): SystemInfoService {
    if (!SystemInfoService.instance) {
      SystemInfoService.instance = new SystemInfoService();
    }
    return SystemInfoService.instance;
  }

  // Store last 60 minutes of trends (3600 points)
  private trendHistory: Record<string, { timestamp: string; value: number }[]> =
    {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
    };

  private updateTrendHistory(metrics: TelemetryData) {
    const timestamp = new Date().toISOString();
    const MAX_HISTORY = 3600;

    const pushData = (key: string, value: number) => {
      this.trendHistory[key].push({ timestamp, value });
      if (this.trendHistory[key].length > MAX_HISTORY) {
        this.trendHistory[key].shift();
      }
    };

    pushData("cpu", metrics.data.hardware.cpu.utilization_percent);
    pushData("memory", metrics.data.hardware.memory.usage_percent);
    pushData(
      "disk",
      metrics.data.hardware.storage.devices[0]?.usage_percent || 0
    );

    const netSpeed =
      (metrics.data.hardware.network.interfaces[0]?.rx_bytes_per_sec || 0) /
      1024 /
      1024;
    pushData("network", netSpeed);
  }

  public getTrends(): Record<string, TrendData> {
    const formatTrend = (
      metric: string,
      unit: string,
      key: string
    ): TrendData => {
      const history = this.trendHistory[key];
      const current =
        history.length > 0 ? history[history.length - 1].value : 0;
      const values = history.map((h) => h.value);

      return {
        metric,
        unit,
        data: history,
        current,
        average:
          values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
    };

    return {
      cpu: formatTrend("CPU Utilization", "%", "cpu"),
      memory: formatTrend("Memory Usage", "%", "memory"),
      disk: formatTrend("Disk Usage", "%", "disk"),
      network: formatTrend("Network Traffic", "MB/s", "network"),
    };
  }

  private startCollectionLoop() {
    if (this.isCollecting) return;
    this.isCollecting = true;

    // Initial collection
    this.collectMetrics().catch(console.error);

    // Interval collection (1 second)
    setInterval(() => {
      this.collectMetrics().catch(console.error);
    }, 1000);
  }

  private async collectMetrics() {
    try {
      const [
        cpu,
        currentLoad,
        cpuTemp,
        mem,
        fsSize,
        diskLayout,
        networkStats,
        networkInterfaces,
        osInfo,
        time,
      ] = await Promise.all([
        si.cpu(),
        si.currentLoad(),
        si.cpuTemperature(),
        si.mem(),
        si.fsSize(),
        si.diskLayout(),
        si.networkStats(),
        si.networkInterfaces(),
        si.osInfo(),
        si.time(),
      ]);

      let hardware: HardwareHealth = {
        cpu: this.mapCpuMetrics(cpu, currentLoad, cpuTemp),
        memory: this.mapMemoryMetrics(mem),
        storage: this.mapStorageMetrics(fsSize, diskLayout),
        network: this.mapNetworkMetrics(networkStats, networkInterfaces),
        power: this.getMockPowerMetrics(currentLoad.currentLoad),
        temperature: this.getMockTemperatureMetrics(
          cpuTemp,
          currentLoad.currentLoad
        ),
        services: {
          systemd_services: {
            total_services: 0,
            active_services: 0,
            failed_services: 0,
            critical_services: [],
          },
          web_services: [],
          database_services: [],
        },
        security: this.getMockSecurityMetrics(),
      };

      // MERGE TRUENAS DATA IF AVAILABLE - SELECTIVE MERGE
      if (this.trueNASConnector) {
        const realMetrics = this.trueNASConnector.getMetrics();
        const envMetrics = this.trueNASConnector.getEnvironment();

        // 1. CPU MERGE
        if (
          realMetrics.cpu &&
          realMetrics.cpu.utilization_percent !== undefined
        ) {
          // Keep existing static info (frequency, etc) if TrueNAS doesn't provide it
          // TrueNAS provides: utilization, per_core, temp
          hardware.cpu.utilization_percent =
            realMetrics.cpu.utilization_percent;
          hardware.cpu.per_core_utilization =
            realMetrics.cpu.per_core_utilization;
          hardware.cpu.core_count = realMetrics.cpu.core_count; // usually matches

          // Only overwrite temp if valid
          if (realMetrics.cpu.temperature_celsius) {
            hardware.cpu.temperature_celsius =
              realMetrics.cpu.temperature_celsius;

            // SYNC GLOBAL TEMP CARD
            if (realMetrics.cpu.temperature_celsius.package > 0) {
              hardware.temperature.coretemp[0].current_celsius =
                realMetrics.cpu.temperature_celsius.package;
              hardware.temperature.coretemp[0].is_simulated = false;
            }
          }
        }

        // 2. MEMORY MERGE
        if (realMetrics.memory && realMetrics.memory.total_gb > 0) {
          // TrueNAS memory authoritative
          hardware.memory = { ...hardware.memory, ...realMetrics.memory };
        }

        // 3. NETWORK MERGE
        if (realMetrics.network && realMetrics.network.interfaces.length > 0) {
          // Smart merge: Match interfaces by name to keep IP addresses from 'si'
          // while taking rates from 'TrueNAS'

          const trueNasInterfaces = realMetrics.network.interfaces;

          const mergedInterfaces = hardware.network.interfaces.map(
            (localIface) => {
              const realIface = trueNasInterfaces.find(
                (r) => r.name === localIface.name
              );
              if (realIface) {
                return {
                  ...localIface,
                  // Update dynamic stats
                  rx_bytes_per_sec: realIface.rx_bytes_per_sec,
                  tx_bytes_per_sec: realIface.tx_bytes_per_sec,
                  speed_mbps: realIface.speed_mbps || localIface.speed_mbps,
                  status: realIface.status,
                };
              }
              return localIface;
            }
          );

          // Add any TrueNAS interfaces not found in local (e.g. bridges)
          trueNasInterfaces.forEach((realIface) => {
            if (
              !hardware.network.interfaces.find(
                (l) => l.name === realIface.name
              )
            ) {
              mergedInterfaces.push(realIface);
            }
          });

          hardware.network.interfaces = mergedInterfaces;
        }

        // 4. POWER MERGE (IPMI)
        if (realMetrics.power && !realMetrics.power.is_simulated) {
          hardware.power = realMetrics.power as any;
        }

        // 5. SECURITY MERGE (IPMI context)
        if (realMetrics.security) {
          hardware.security = {
            ...hardware.security,
            ...(realMetrics.security as any),
          };
        }
      }

      // Try to read host OS info if mounted
      let hostOsName = `${osInfo.distro} ${osInfo.release}`;
      let realHostname = osInfo.hostname;

      // 1. Prefer Environment Variable (Override)
      if (process.env.SERVER_HOSTNAME) {
        realHostname = process.env.SERVER_HOSTNAME;
      }
      // 2. Prefer TrueNAS Hostname if available and no override
      else if (this.trueNASConnector) {
        const tnHostname = this.trueNASConnector.getHostname();
        if (tnHostname) {
          realHostname = tnHostname;
        }
      }

      try {
        const fs = require("fs");
        if (fs.existsSync("/host/etc/os-release")) {
          const osRelease = fs.readFileSync("/host/etc/os-release", "utf8");
          const prettyNameMatch = osRelease.match(/PRETTY_NAME="([^"]+)"/);
          if (prettyNameMatch && prettyNameMatch[1]) {
            hostOsName = prettyNameMatch[1];
          }
        }
      } catch (e) {
        // failed
      }

      const meta: ServerMetadata = {
        hostname: realHostname,
        server_type: "generic",
        os_distribution: hostOsName,
        kernel_version: osInfo.kernel,
        uptime_seconds: time.uptime,
        telemetry_version: "1.0.0",
        collection_timestamp: new Date().toISOString(),
      };

      const metricsData = {
        hardware,
        os_health: {
          boot_time: new Date(Date.now() - time.uptime * 1000).toISOString(),
          uptime_seconds: time.uptime,
          kernel_version: osInfo.kernel,
          os_distribution: hostOsName,
          system_calls_per_sec: 0,
          context_switches_per_sec: 0,
          interrupts_per_sec: 0,
          processes: {
            total: 0,
            running: 0,
            sleeping: 0,
            zombie: 0,
            stopped: 0,
          },
        },
        services: hardware.services,
        security: hardware.security,
        environment:
          this.trueNASConnector &&
          this.trueNASConnector.getEnvironment() &&
          !this.trueNASConnector.getEnvironment().is_simulated
            ? this.trueNASConnector.getEnvironment()
            : this.getMockEnvironmentMetrics(),
        alerts: [],
      };

      // Update cache
      this.currentMetrics = { meta, data: metricsData };

      // Update history for trends
      this.updateTrendHistory({ meta, data: metricsData });
    } catch (error) {
      console.error("Error collecting background metrics:", error);
    }
  }

  public async getSystemMetrics(): Promise<TelemetryData> {
    // Return cached metrics if available, otherwise trigger initial collection
    if (this.currentMetrics) {
      return this.currentMetrics;
    }

    // If loop hasn't run yet, wait for one collection
    await this.collectMetrics();
    if (this.currentMetrics) {
      return this.currentMetrics;
    }

    throw new Error("Failed to collect system metrics");
  }

  private mapCpuMetrics(
    cpu: si.Systeminformation.CpuData,
    load: si.Systeminformation.CurrentLoadData,
    temp: si.Systeminformation.CpuTemperatureData
  ): CPUMetrics {
    return {
      utilization_percent: load.currentLoad,
      per_core_utilization: load.cpus.map((c) => c.load),
      load_average: [0, 0, 0], // si.currentLoad doesn't return averages directly in this call, usually loadavg()
      core_count: cpu.cores,
      physical_core_count: cpu.physicalCores,
      frequency_mhz: {
        base: cpu.speed,
        current: cpu.speed, // Dynamic speed requires real-time sampling
        turbo_active: false,
      },
      temperature_celsius: {
        package: temp.main || 40 + (load.currentLoad / 100) * 30, // Propagate simulated value
        cores: temp.cores || [],
      },
      thermal_throttling_events: 0,
      power_consumption_watts: 0, // Requires IPMI
      times_percent: {
        user: load.currentLoadUser,
        system: load.currentLoadSystem,
        idle: load.currentLoadIdle,
        nice: load.currentLoadNice,
        iowait: load.currentLoadIrq, // mapping approximation
        irq: load.currentLoadIrq,
        softirq: 0,
      },
    };
  }

  private mapMemoryMetrics(mem: si.Systeminformation.MemData): MemoryMetrics {
    return {
      total_gb: mem.total / 1024 / 1024 / 1024,
      used_gb: mem.active / 1024 / 1024 / 1024,
      available_gb: mem.available / 1024 / 1024 / 1024,
      swap_used_gb: mem.swapused / 1024 / 1024 / 1024,
      swap_total_gb: mem.swaptotal / 1024 / 1024 / 1024,
      usage_percent: (mem.active / mem.total) * 100,
      page_faults_rate: 0,
      memory_errors: { corrected: 0, uncorrected: 0 },
    };
  }

  private mapStorageMetrics(
    fsStats: si.Systeminformation.FsSizeData[],
    disks: si.Systeminformation.DiskLayoutData[]
  ): StorageMetrics {
    let devices: StorageDevice[] = [];

    if (disks && disks.length > 0) {
      devices = disks.map((disk, index) => {
        // Heuristic for Windows: if devices[0], assume it contains C: (or use first available fs)
        // Real mapping requires matching mount points or device names
        let fsInfo = fsStats.find(
          (f) =>
            f.fs.startsWith(disk.device) ||
            (disk.device && f.fs.includes(disk.device))
        );

        // Fallback: If no match and it's the first disk, try connecting it to 'C:' or '/'
        if (!fsInfo && index === 0) {
          fsInfo = fsStats.find((f) => f.fs === "C:" || f.mount === "/");
        }

        // If still no match, just take the first one or default
        if (!fsInfo && fsStats.length > 0 && index === 0) {
          fsInfo = fsStats[0];
        }

        const size_gb = disk.size / 1024 / 1024 / 1024;
        const used_gb = fsInfo ? fsInfo.used / 1024 / 1024 / 1024 : 0;

        return {
          device: disk.device,
          model: disk.name,
          size_gb,
          used_gb,
          available_gb: size_gb - used_gb,
          usage_percent: size_gb > 0 ? (used_gb / size_gb) * 100 : 0,
          drive_type: disk.type === "SSD" ? "ssd" : "hdd", // Simplified
          interface_type: (disk.interfaceType.toLowerCase() as any) || "sata",
          smart_status: disk.smartStatus === "Ok" ? "healthy" : "warning",
          temperature_celsius: 0, // Requires smartctl or sensor
          temperature_fluctuation_5min: 0,
          power_on_hours: 0,
          power_cycles: 0,
          wear_level_percent: 0,
          tbw_written: 0,
          tbw_total: 0,
          tbw_percentage: 0,
          read_bytes_total: 0,
          write_bytes_total: 0,
          read_iops_peak: 0,
          write_iops_peak: 0,
          read_throughput_peak_mbps: 0,
          write_throughput_peak_mbps: 0,
          current_read_iops: 0,
          current_write_iops: 0,
          current_read_throughput_mbps: 0,
          current_write_throughput_mbps: 0,
          serial_number: disk.serialNum,
          firmware_version: disk.firmwareRevision,
        };
      });
    } else {
      // Fallback: Specific logic for TrueNAS ZFS Pools
      // We expect pools to be mounted at /host/mnt (via docker-compose)
      // We process 'fs' which contains all detected filesystems

      const relevantFs = fsStats.filter((f) => {
        // Must be ZFS
        // Note: systeminformation might report type 'zfs' or raw fs 'zfs'
        const isZfs =
          (f.type && f.type.toLowerCase() === "zfs") ||
          (f.fs && !f.fs.startsWith("/")); // zfs pool names don't start with /

        if (!isZfs) return false;

        // Exclude boot-pool as requested
        if (f.fs.startsWith("boot-pool")) return false;

        // Exclude datasets (contain slashes, e.g. "pool/dataset")
        // We only want the root pool (e.g. "collab-services", "media")
        if (f.fs.includes("/")) return false;

        // Must be non-zero size
        if (f.size <= 0) return false;

        return true;
      });

      devices = relevantFs.map((f) => ({
        device: f.fs, // Pool Name (e.g. "collab-services")
        model: "ZFS Pool", // Generic Label
        size_gb: f.size / 1024 / 1024 / 1024,
        used_gb: f.used / 1024 / 1024 / 1024,
        available_gb: (f.size - f.used) / 1024 / 1024 / 1024,
        usage_percent: f.use,
        drive_type: "ssd",
        interface_type: "unknown" as any,
        smart_status: "healthy",
        temperature_celsius: 0,
        temperature_fluctuation_5min: 0,
        power_on_hours: 0,
        power_cycles: 0,
        wear_level_percent: 0,
        tbw_written: 0,
        tbw_total: 0,
        tbw_percentage: 0,
        read_bytes_total: 0,
        write_bytes_total: 0,
        read_iops_peak: 0,
        write_iops_peak: 0,
        read_throughput_peak_mbps: 0,
        write_throughput_peak_mbps: 0,
        current_read_iops: 0,
        current_write_iops: 0,
        current_read_throughput_mbps: 0,
        current_write_throughput_mbps: 0,
        serial_number: "virtual",
        firmware_version: "1.0",
      }));
    }

    return {
      devices,
      raid_arrays: [],
      io_stats: {
        read_iops: 0,
        write_iops: 0,
        read_throughput_mbps: 0,
        write_throughput_mbps: 0,
        await_time_ms: 0,
        queue_depth: 0,
      },
    };
  }

  private mapNetworkMetrics(
    stats: si.Systeminformation.NetworkStatsData[],
    interfaces:
      | si.Systeminformation.NetworkInterfacesData[]
      | si.Systeminformation.NetworkInterfacesData
  ): NetworkMetrics {
    const ifaceList = Array.isArray(interfaces) ? interfaces : [interfaces]; // Should be array

    const ifaceMetrics = ifaceList.map((iface) => {
      const stat = stats.find((s) => s.iface === iface.iface);
      return {
        name: iface.iface,
        status: (iface.operstate === "up" ? "up" : "down") as "up" | "down",
        speed_mbps: iface.speed || 1000,
        duplex: iface.duplex,
        mtu: iface.mtu || 0,
        rx_bytes_per_sec: stat ? stat.rx_sec : 0,
        tx_bytes_per_sec: stat ? stat.tx_sec : 0,
        rx_packets_per_sec: 0,
        tx_packets_per_sec: 0,
        rx_errors: stat ? stat.rx_errors : 0,
        tx_errors: stat ? stat.tx_errors : 0,
        rx_dropped: stat ? stat.rx_dropped : 0,
        tx_dropped: stat ? stat.tx_dropped : 0,
        addresses: [
          {
            family: "IPv4",
            address: iface.ip4,
            netmask: iface.ip4subnet,
            broadcast: "",
          },
        ],
      };
    });

    return {
      interfaces: ifaceMetrics,
      active_connections: {
        tcp_established: 0,
        tcp_listen: 0,
        udp_active: 0,
      },
    };
  }

  // Mocks for data not easily available via standard cross-platform libraries
  private getMockPowerMetrics(cpuLoad: number = 20) {
    const basePower = 100;
    const loadPower = (cpuLoad / 100) * 150; // Max 150W extra at 100% load
    const currentWatts = Math.round(
      basePower + loadPower + (Math.random() * 10 - 5)
    );

    return {
      is_simulated: true,
      psu_status: ["healthy", "healthy"] as "healthy"[],
      psu_count: 2,
      psu_redundancy: true,
      power_consumption_watts: currentWatts,
      power_consumption_peak_watts: 400,
      power_efficiency_percent: 92,
      voltage_levels: {
        "3.3v": 3.3,
        "5v": 5.0,
        "12v": 12.0,
        "3.3v_fluctuation": 0,
        "5v_fluctuation": 0,
        "12v_fluctuation": 0,
      },
      voltage_stability: "stable" as const,
      fans: {
        cpu_fans: this.getMockFanData("CPU Fan"),
        case_fans: this.getMockFanData("Case Fan"),
      },
    };
  }

  private getMockFanData(prefix: string): FanData[] {
    return [1, 2].map((i) => ({
      label: `${prefix} ${i}`,
      current_rpm: 1500,
      max_rpm: 2500,
      speed_percent: 60,
      target_rpm: 1500,
      speed_fluctuation_5min: 0,
      efficiency_percent: 90,
      status: "normal",
      rpm_history: [],
      temperature_correlated: true,
      is_simulated: true,
    }));
  }

  private getMockTemperatureMetrics(
    cpuTemp: si.Systeminformation.CpuTemperatureData,
    load: number = 20
  ) {
    // If real temp is 0/null (common on Windows without admin), simulate it
    let pkgTemp = cpuTemp.main || 0;
    let is_simulated = false;

    if (pkgTemp === 0) {
      // Simulate temp: Base 40C + up to 30C based on load + random jitter
      pkgTemp = 40 + (load / 100) * 30 + (Math.random() * 4 - 2);
      is_simulated = true;
    }

    return {
      coretemp: [
        {
          label: "CPU Package",
          current_celsius: pkgTemp,
          high_celsius: 85,
          critical_celsius: 100,
          is_simulated,
        },
      ],
    };
  }

  private getMockSecurityMetrics() {
    return {
      is_simulated: true,
      authentication: {
        failed_ssh_attempts_24h: 0,
        failed_login_attempts_24h: 0,
        active_user_sessions: 1,
        sudo_commands_24h: 0,
        last_password_change: new Date().toISOString(),
      },
      firewall: {
        status: "active" as const,
        rules_count: 0,
        blocked_connections_24h: 0,
        recent_changes: [],
      },
      file_integrity: {
        critical_files_changed_24h: 0,
        permission_anomalies: 0,
        setuid_files: 0,
        last_integrity_scan: new Date().toISOString(),
      },
      vulnerabilities: {
        critical_cves: 0,
        high_cves: 0,
        last_security_update: new Date().toISOString(),
      },
    };
  }

  private getMockEnvironmentMetrics() {
    return {
      is_simulated: true,
      temperature: {
        ambient_celsius: 22,
        intake_celsius: 24,
        exhaust_celsius: 35,
        inlet_temp_fluctuation_5min: 0,
        exhaust_temp_fluctuation_5min: 0,
        temperature_rise: 11,
        cooling_efficiency: 95,
      },
      cooling: {
        fans: this.getMockFanData("Chassis Fan"),
      },
      chassis: {
        intrusion_detected: false,
        case_open_events_today: 0,
        door_status: "closed" as const,
      },
    };
  }
}
