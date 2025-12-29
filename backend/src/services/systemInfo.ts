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
} from "../types/telemetry";

export class SystemInfoService {
  private static instance: SystemInfoService;

  private constructor() {}

  public static getInstance(): SystemInfoService {
    if (!SystemInfoService.instance) {
      SystemInfoService.instance = new SystemInfoService();
    }
    return SystemInfoService.instance;
  }

  public async getSystemMetrics(): Promise<TelemetryData> {
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

    const hardware: HardwareHealth = {
      cpu: this.mapCpuMetrics(cpu, currentLoad, cpuTemp),
      memory: this.mapMemoryMetrics(mem),
      storage: this.mapStorageMetrics(fsSize, diskLayout),
      network: this.mapNetworkMetrics(networkStats, networkInterfaces),
      power: this.getMockPowerMetrics(currentLoad.currentLoad), // Mock based on load
      temperature: this.getMockTemperatureMetrics(
        cpuTemp,
        currentLoad.currentLoad
      ), // Simulate if missing
      services: {
        // These will be populated by Docker service or basic systemd check
        systemd_services: {
          total_services: 0,
          active_services: 0,
          failed_services: 0,
          critical_services: [],
        },
        web_services: [],
        database_services: [],
      },
      security: this.getMockSecurityMetrics(), // Difficult to get real security metrics without root/auditing
    };

    const meta: ServerMetadata = {
      hostname: osInfo.hostname,
      server_type: "generic", // Detection logic or env var
      os_distribution: `${osInfo.distro} ${osInfo.release}`,
      kernel_version: osInfo.kernel,
      uptime_seconds: time.uptime,
      telemetry_version: "1.0.0",
      collection_timestamp: new Date().toISOString(),
    };

    return {
      meta,
      data: {
        hardware,
        os_health: {
          boot_time: new Date(Date.now() - time.uptime * 1000).toISOString(),
          uptime_seconds: time.uptime,
          kernel_version: osInfo.kernel,
          os_distribution: `${osInfo.distro} ${osInfo.release}`,
          system_calls_per_sec: 0, // Requires more advanced monitoring
          context_switches_per_sec: 0,
          interrupts_per_sec: 0,
          processes: {
            total: 0, // Could get valid values from si.processes()
            running: 0,
            sleeping: 0,
            zombie: 0,
            stopped: 0,
          },
        },
        services: hardware.services,
        security: hardware.security,
        environment: this.getMockEnvironmentMetrics(),
        alerts: [],
      },
    };
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
    fs: si.Systeminformation.FsSizeData[],
    disks: si.Systeminformation.DiskLayoutData[]
  ): StorageMetrics {
    const devices: StorageDevice[] = disks.map((disk, index) => {
      // Heuristic for Windows: if devices[0], assume it contains C: (or use first available fs)
      // Real mapping requires matching mount points or device names
      let fsInfo = fs.find(
        (f) =>
          f.fs.startsWith(disk.device) ||
          (disk.device && f.fs.includes(disk.device))
      );

      // Fallback: If no match and it's the first disk, try connecting it to 'C:' or '/'
      if (!fsInfo && index === 0) {
        fsInfo = fs.find((f) => f.fs === "C:" || f.mount === "/");
      }

      // If still no match, just take the first one or default
      if (!fsInfo && fs.length > 0 && index === 0) {
        fsInfo = fs[0];
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
        mtu: iface.mtu,
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
    }));
  }

  private getMockTemperatureMetrics(
    cpuTemp: si.Systeminformation.CpuTemperatureData,
    load: number = 20
  ) {
    // If real temp is 0/null (common on Windows without admin), simulate it
    let pkgTemp = cpuTemp.main || 0;
    if (pkgTemp === 0) {
      // Simulate temp: Base 40C + up to 30C based on load + random jitter
      pkgTemp = 40 + (load / 100) * 30 + (Math.random() * 4 - 2);
    }

    return {
      coretemp: [
        {
          label: "CPU Package",
          current_celsius: pkgTemp,
          high_celsius: 85,
          critical_celsius: 100,
        },
      ],
    };
  }

  private getMockSecurityMetrics() {
    return {
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
