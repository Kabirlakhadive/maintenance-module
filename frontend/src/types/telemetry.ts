// TypeScript interfaces for PT1 Telemetry Dashboard
// Based on GUIDE.md specifications

export interface ServerMetadata {
  hostname: string;
  server_type: 'inspur' | 'hp' | 'dell' | 'generic';
  os_distribution: string;
  kernel_version: string;
  uptime_seconds: number;
  telemetry_version: string;
  collection_timestamp: string;
}

export interface CPUMetrics {
  utilization_percent: number;
  per_core_utilization: number[];
  load_average: [number, number, number]; // 1min, 5min, 15min
  core_count: number;
  physical_core_count: number;
  frequency_mhz: {
    base: number;
    current: number;
    turbo_active: boolean;
  };
  temperature_celsius: {
    package: number;
    cores: number[];
  };
  thermal_throttling_events: number;
  power_consumption_watts: number;
  uptime_seconds?: number;
  times_percent: {
    user: number;
    system: number;
    idle: number;
    nice: number;
    iowait: number;
    irq: number;
    softirq: number;
  };
}

export interface MemoryMetrics {
  total_gb: number;
  used_gb: number;
  available_gb: number;
  swap_used_gb: number;
  swap_total_gb: number;
  usage_percent: number;
  page_faults_rate: number;
  memory_errors: {
    corrected: number;
    uncorrected: number;
  };
}

export interface StorageDevice {
  device: string;
  model: string;
  size_gb: number;
  used_gb: number;
  available_gb: number;
  usage_percent: number;
  drive_type: 'ssd' | 'nvme' | 'hdd';
  interface_type: 'sata' | 'sas' | 'pcie' | 'usb';
  smart_status: 'healthy' | 'warning' | 'critical';
  temperature_celsius: number;
  temperature_fluctuation_5min: number;
  power_on_hours: number;
  power_cycles: number;
  wear_level_percent: number;
  tbw_written: number;
  tbw_total: number;
  tbw_percentage: number;
  read_bytes_total: number;
  write_bytes_total: number;
  read_iops_peak: number;
  write_iops_peak: number;
  read_throughput_peak_mbps: number;
  write_throughput_peak_mbps: number;
  current_read_iops: number;
  current_write_iops: number;
  current_read_throughput_mbps: number;
  current_write_throughput_mbps: number;
  serial_number: string;
  firmware_version: string;
}

export interface RAIDArray {
  device: string;
  level: string;
  status: 'healthy' | 'degraded' | 'rebuilding';
  devices: string[];
  sync_progress: number | null;
}

export interface StorageMetrics {
  devices: StorageDevice[];
  raid_arrays: RAIDArray[];
  io_stats: {
    read_iops: number;
    write_iops: number;
    read_throughput_mbps: number;
    write_throughput_mbps: number;
    await_time_ms: number;
    queue_depth: number;
  };
}

export interface NetworkInterface {
  name: string;
  status: 'up' | 'down';
  speed_mbps: number;
  duplex: string;
  mtu: number;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  rx_packets_per_sec: number;
  tx_packets_per_sec: number;
  rx_errors: number;
  tx_errors: number;
  rx_dropped: number;
  tx_dropped: number;
  addresses: Array<{
    family: string;
    address: string;
    netmask: string;
    broadcast: string;
  }>;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  active_connections: {
    tcp_established: number;
    tcp_listen: number;
    udp_active: number;
  };
}

export interface TemperatureSensor {
  label: string;
  current_celsius: number;
  high_celsius: number;
  critical_celsius: number;
}

export interface FanData {
  label: string;
  current_rpm: number;
  max_rpm: number;
  speed_percent: number;
  target_rpm: number;
  speed_fluctuation_5min: number;
  efficiency_percent: number;
  status: 'normal' | 'warning' | 'critical' | 'failed';
  rpm_history: number[];
  temperature_correlated: boolean;
}

export interface PowerMetrics {
  psu_status: ('healthy' | 'warning' | 'critical')[];
  psu_count: number;
  psu_redundancy: boolean;
  power_consumption_watts: number;
  power_consumption_peak_watts: number;
  power_efficiency_percent: number;
  voltage_levels: {
    '3.3v': number;
    '5v': number;
    '12v': number;
    '3.3v_fluctuation': number;
    '5v_fluctuation': number;
    '12v_fluctuation': number;
  };
  voltage_stability: 'stable' | 'fluctuating' | 'unstable';
  ups_status?: {
    connected: boolean;
    battery_charge_percent: number;
    time_remaining_minutes: number;
    on_battery: boolean;
    battery_health: 'good' | 'degrading' | 'critical';
    output_voltage: number;
    load_percentage: number;
  };
  fans: Record<string, FanData[]>;
}

export interface EnvironmentalMetrics {
  temperature: {
    ambient_celsius: number;
    intake_celsius: number;
    exhaust_celsius: number;
    inlet_temp_fluctuation_5min: number;
    exhaust_temp_fluctuation_5min: number;
    temperature_rise: number;
    cooling_efficiency: number;
  };
  cooling: {
    fans: FanData[];
    liquid_cooling?: {
      pump_rpm: number;
      coolant_temperature_celsius: number;
      flow_rate_lpm: number;
    };
  };
  chassis: {
    intrusion_detected: boolean;
    case_open_events_today: number;
    door_status: 'open' | 'closed';
  };
}

export interface SystemdService {
  name: string;
  status: 'active' | 'inactive' | 'failed';
  uptime_seconds: number;
  restart_count: number;
}

export interface WebService {
  name: string;
  url: string;
  status_code: number;
  response_time_ms: number;
  ssl_expiry_days: number;
  certificate_valid: boolean;
}

export interface DatabaseService {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis';
  version: string;
  connections: {
    active: number;
    idle: number;
    max_allowed: number;
  };
  replication_lag_seconds: number;
  slow_queries_per_minute: number;
}

export interface ServiceMetrics {
  systemd_services: {
    total_services: number;
    active_services: number;
    failed_services: number;
    critical_services: SystemdService[];
  };
  web_services: WebService[];
  database_services: DatabaseService[];
}

export interface SecurityMetrics {
  authentication: {
    failed_ssh_attempts_24h: number;
    failed_login_attempts_24h: number;
    active_user_sessions: number;
    sudo_commands_24h: number;
    last_password_change: string;
  };
  firewall: {
    status: 'active' | 'inactive';
    rules_count: number;
    blocked_connections_24h: number;
    recent_changes: Array<{
      timestamp: string;
      action: string;
      rule: string;
    }>;
  };
  file_integrity: {
    critical_files_changed_24h: number;
    permission_anomalies: number;
    setuid_files: number;
    last_integrity_scan: string;
  };
  vulnerabilities: {
    critical_cves: number;
    high_cves: number;
    last_security_update: string;
  };
}

export interface Alert {
  id: string;
  hostname: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  resolved: boolean;
  resolved_time?: string;
}

export interface HardwareHealth {
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  storage: StorageMetrics;
  network: NetworkMetrics;
  power: PowerMetrics;
  temperature: Record<string, TemperatureSensor[]>;
  services: ServiceMetrics;
  security: SecurityMetrics;
}

export interface TelemetryData {
  meta: ServerMetadata;
  data: {
    hardware: HardwareHealth;
    os_health: {
      boot_time: string;
      uptime_seconds: number;
      kernel_version: string;
      os_distribution: string;
      system_calls_per_sec: number;
      context_switches_per_sec: number;
      interrupts_per_sec: number;
      processes: {
        total: number;
        running: number;
        sleeping: number;
        zombie: number;
        stopped: number;
      };
    };
    services: ServiceMetrics;
    security: SecurityMetrics;
    environment: EnvironmentalMetrics;
    alerts: Alert[];
  };
}

export interface ServerStatus {
  hostname: string;
  status: 'healthy' | 'warning' | 'critical';
  server_type: string;
  os_distribution: string;
  hardware: HardwareHealth;
  alerts: Alert[];
  environment?: EnvironmentalMetrics;
}

// Dashboard UI Types
export interface TimeRange {
  label: string;
  value: string;
  from: string;
  to: string;
}

export interface DashboardConfig {
  timeRange: TimeRange;
  autoRefresh: boolean;
  refreshInterval: number;
}

// Chart data types
export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface TrendData {
  metric: string;
  unit: string;
  data: ChartDataPoint[];
  current: number;
  average: number;
  min: number;
  max: number;
}