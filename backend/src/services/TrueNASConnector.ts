import WebSocket from "ws";
import {
  HardwareHealth,
  CPUMetrics,
  MemoryMetrics,
  NetworkMetrics,
  NetworkInterface,
  TelemetryData,
} from "../types/telemetry";

interface TrueNASAuthParams {
  host: string;
  token: string;
}

export class TrueNASConnector {
  private ws: WebSocket | null = null;
  private host: string;
  private token: string;
  private isConnected: boolean = false;
  private latestMetrics: Partial<HardwareHealth> = {};
  private latestEnvironment: any = {};
  private reconnectInterval: NodeJS.Timeout | null = null;
  private ipmiInterval: NodeJS.Timeout | null = null;
  private ipmiSensors: any[] = [];
  private ipmiChassis: any = {};
  private hostname: string | null = null;

  // Track subscription state
  private isAuthenticated: boolean = false;

  constructor(config: TrueNASAuthParams) {
    this.host = config.host;
    this.token = config.token;
  }

  public connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    const url = `wss://${this.host}/websocket`;
    console.log(`Connecting to TrueNAS WebSocket: ${url}`);

    // Reject Unauthorized is false because TrueNAS often uses self-signed certs
    this.ws = new WebSocket(url, {
      rejectUnauthorized: false,
    });

    this.ws.on("open", this.onOpen.bind(this));
    this.ws.on("message", this.onMessage.bind(this));
    this.ws.on("error", (err) => console.error("TrueNAS WS Error:", err));
    this.ws.on("close", this.onClose.bind(this));
  }

  private onOpen() {
    console.log("TrueNAS WS Connected");
    this.isConnected = true;

    // 1. Connect Handshake
    this.send({
      msg: "connect",
      version: "1",
      support: ["1"],
    });

    // 2. Authenticate
    this.send({
      id: "auth_request",
      msg: "method",
      method: "auth.login_with_token",
      params: [this.token],
    });
  }

  private onMessage(data: WebSocket.RawData) {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.msg === "result") {
        // Handle Auth Result
        if (msg.id === "auth_request" && msg.result === true) {
          console.log("TrueNAS Auth Successful");
          this.isAuthenticated = true;

          // Fetch System Info (Hostname)
          this.send({
            id: "sys_info_request",
            msg: "method",
            method: "system.info",
            params: [],
          });

          this.subscribeToMetrics();
          this.startIPMIPolling();
        }

        // Handle System Info Result
        if (msg.id === "sys_info_request" && msg.result) {
          this.hostname = msg.result.hostname;
          console.log("TrueNAS Hostname identified:", this.hostname);
        }

        // Handle IPMI Chassis Info
        if (msg.id && msg.id.startsWith("ipmi_chassis_") && msg.result) {
          this.ipmiChassis = msg.result;
          this.mergeIPMIData();
        }

        // Handle IPMI Sensors
        if (msg.id && msg.id.startsWith("ipmi_sensors_") && msg.result) {
          this.ipmiSensors = msg.result;
          this.mergeIPMIData();
        }
      }

      if (msg.msg === "ping") {
        this.send({ msg: "pong", id: msg.id });
      }

      if (
        (msg.msg === "added" || msg.msg === "changed") &&
        msg.collection === "reporting.realtime"
      ) {
        this.processRealtimeData(msg.fields);
      }
    } catch (e) {
      console.error("Error parsing TrueNAS WS message", e);
    }
  }

  public getHostname(): string | null {
    return this.hostname;
  }

  private subscribeToMetrics() {
    console.log("Subscribing to reporting.realtime...");
    this.send({
      id: this.generateId(),
      msg: "sub",
      name: "reporting.realtime",
    });
  }

  private startIPMIPolling() {
    if (this.ipmiInterval) clearInterval(this.ipmiInterval);
    // Poll IPMI every 15 seconds
    this.ipmiInterval = setInterval(() => this.pollIPMI(), 15000);
    this.pollIPMI(); // Initial poll
  }

  private stopIPMIPolling() {
    if (this.ipmiInterval) clearInterval(this.ipmiInterval);
  }

  private pollIPMI() {
    if (!this.isAuthenticated) return;

    // Chassis Info
    this.send({
      id: "ipmi_chassis_" + this.generateId(),
      msg: "method",
      method: "ipmi.chassis.info",
      params: [],
    });

    // Sensors
    this.send({
      id: "ipmi_sensors_" + this.generateId(),
      msg: "method",
      method: "ipmi.sensors.query",
      params: [],
    });
  }

  private onClose() {
    console.log("TrueNAS WS Closed. Reconnecting in 5s...");
    this.isConnected = false;
    this.isAuthenticated = false;
    this.stopIPMIPolling();
    setTimeout(() => this.connect(), 5000);
  }

  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // --- Data Mapping ---

  private processRealtimeData(fields: any) {
    // fields: { key: value, cpu: [...], temperature_celsius: {...}, ... }

    // 1. CPU
    const cpuMetrics = this.mapCPU(fields.cpu, fields.temperature_celsius);

    // 2. Memory
    const memMetrics = this.mapMemory(fields.virtual_memory, fields.zfs);

    // 3. Network
    const netMetrics = this.mapNetwork(fields.interfaces);

    this.latestMetrics = {
      ...this.latestMetrics, // Keep IPMI data
      cpu: cpuMetrics,
      memory: memMetrics,
      network: netMetrics,
    };
  }

  private mapCPU(cpuData: any[], tempData: any): CPUMetrics {
    // cpuData: [{user, system, idle...}, ...]
    if (!cpuData || cpuData.length === 0) return {} as any;

    const cores = cpuData.map((c) => {
      const idle = c.idle || 0;
      return 100 - idle;
    });

    const avgUtil = cores.reduce((a, b) => a + b, 0) / cores.length;

    // Temp: {0: 29, 1: 30}
    const coreTemps: number[] = Object.values(tempData || {}).map((v: any) =>
      Number(v)
    );
    const pkgTemp = coreTemps.length > 0 ? Math.max(...coreTemps) : 0;

    return {
      utilization_percent: avgUtil,
      per_core_utilization: cores,
      load_average: [0, 0, 0], // Not in realtime payload
      core_count: cores.length,
      physical_core_count: cores.length, // approximation
      frequency_mhz: { base: 0, current: 0, turbo_active: false },
      temperature_celsius: {
        package: pkgTemp,
        cores: coreTemps,
      },
      thermal_throttling_events: 0,
      power_consumption_watts: 0,
      times_percent: {
        user: 0,
        system: 0,
        idle: 0,
        nice: 0,
        iowait: 0,
        irq: 0,
        softirq: 0,
      }, // simplified
    } as CPUMetrics;
  }

  private mapMemory(vm: any, zfs: any): MemoryMetrics {
    if (!vm) return {} as any;

    const total = vm.total || 0;
    const used = vm.used || 0;
    // const free = vm.free || 0;

    const used_gb = used / 1024 / 1024 / 1024;
    const total_gb = total / 1024 / 1024 / 1024;

    // ZFS ARC
    // arc_size is bytes
    // We can consider ARC as "used" or "cache".
    // Usually ARC is cache, so available memory should ideally include reclaimable ARC.
    // But for "Used" visualization, let's stick to what the OS reports as used.

    return {
      total_gb,
      used_gb,
      available_gb: (total - used) / 1024 / 1024 / 1024,
      swap_used_gb: 0,
      swap_total_gb: 0,
      usage_percent: (used / total) * 100,
      page_faults_rate: 0,
      memory_errors: { corrected: 0, uncorrected: 0 },
    };
  }

  private mapNetwork(interfaces: any): NetworkMetrics {
    const ifaceList: NetworkInterface[] = [];

    let totalRx = 0;
    let totalTx = 0;

    for (const [name, stats] of Object.entries(interfaces || {})) {
      const s = stats as any;
      ifaceList.push({
        name: name,
        status: s.link_state === "LINK_STATE_UP" ? "up" : "down",
        speed_mbps: s.speed || 0,
        duplex: "unknown",
        mtu: 0,
        rx_bytes_per_sec: s.received_bytes_rate || 0,
        tx_bytes_per_sec: s.sent_bytes_rate || 0,
        rx_packets_per_sec: 0,
        tx_packets_per_sec: 0,
        rx_errors: 0,
        tx_errors: 0,
        rx_dropped: 0,
        tx_dropped: 0,
        addresses: [],
      });
    }

    return {
      interfaces: ifaceList,
      active_connections: { tcp_established: 0, tcp_listen: 0, udp_active: 0 },
    };
  }

  private mergeIPMIData() {
    // Map IPMI data to HardwareHealth structure
    // We strictly use IPMI for: Power, Environment (Fans, Temp), and Chassis Security

    const powerMetrics = this.mapIPMIPower(this.ipmiSensors, this.ipmiChassis);
    const envMetrics = this.mapIPMIEnvironment(
      this.ipmiSensors,
      this.ipmiChassis
    );
    const securityMetrics = this.mapIPMISecurity(this.ipmiChassis);

    // Update latestMetrics with new IPMI info
    this.latestMetrics = {
      ...this.latestMetrics,
      power: powerMetrics,
      security: {
        ...(this.latestMetrics.security as any),
        ...securityMetrics,
      } as any,
    };

    this.latestEnvironment = envMetrics;
  }

  private mapIPMIPower(sensors: any[], chassis: any): any {
    // Look for Power consumption and Voltages
    // Sensor examples: "Pwr Consumption", "PS1 Status", "12V", "5V"

    let power_watts = 0;
    const voltage_levels: any = {
      "3.3v": 0,
      "5v": 0,
      "12v": 0,
    };

    const fans: any = {
      cpu_fans: [],
      case_fans: [],
    };

    const psu_status: string[] = [];
    let psu_count = 0;

    sensors.forEach((s) => {
      const name = s.name.toLowerCase();
      // Power
      if (
        name.includes("pwr consumption") ||
        name.includes("system power") ||
        name.includes("total_power")
      ) {
        power_watts = s.value;
      }

      // Voltages
      if (name.includes("3.3v") && !name.includes("batt"))
        voltage_levels["3.3v"] = s.value;
      if (name.includes("5v") && !name.includes("dual"))
        voltage_levels["5v"] = s.value;
      if (name.includes("12v")) voltage_levels["12v"] = s.value;

      // PSU Status
      if (
        name.includes("psu") &&
        (name.includes("status") || name.includes("supply"))
      ) {
        // If "ok" (0x00? or string), mark healthy.
        // TrueNAS IPMI often returns string values if parsed, or numbers.
        // Assuming raw value checking might be needed, but 's.value' is likely parsed.
        // Based on user output: "Presence detected" or "Presence detected, Power Supply AC lost"
        // If it's a string from middleware:
        const val = String(s.value || "").toLowerCase();
        if (
          val.includes("ac lost") ||
          val.includes("failure") ||
          val.includes("error")
        ) {
          psu_status.push("critical");
        } else if (
          val.includes("presence detected") ||
          val === "ok" ||
          s.value === 1
        ) {
          psu_status.push("healthy");
        } else {
          psu_status.push("warning");
        }
        psu_count++;
      }

      // Fans (Backward compatibility for PowerMetrics)
      if (s.type === "Fan" || s.units === "RPM") {
        const fanData = {
          label: s.name,
          current_rpm: s.value,
          max_rpm: 0,
          status: s.value > 0 ? "normal" : "stopped",
          is_simulated: false,
        };

        if (name.includes("cpu")) {
          fans.cpu_fans.push(fanData);
        } else {
          fans.case_fans.push(fanData);
        }
      }
    });

    // Fallback if no specific PSU sensors found but chassis reports simple status
    if (psu_status.length === 0) {
      if (chassis.power_fault === "true" || chassis.power_fault === true) {
        psu_status.push("critical");
      } else {
        psu_status.push("healthy");
      }
      psu_count = 1;
    }

    return {
      is_simulated: false,
      psu_status: psu_status,
      psu_count: psu_count,
      power_consumption_watts: power_watts,
      power_consumption_peak_watts: 0, // Need history for this
      power_efficiency_percent: 90, // Assumption
      voltage_levels: {
        ...voltage_levels,
        "3.3v_fluctuation": 0,
        "5v_fluctuation": 0,
        "12v_fluctuation": 0,
      },
      voltage_stability: "stable",
      fans, // RESTORED PROPERTY
    };
  }

  private mapIPMIEnvironment(sensors: any[], chassis: any): any {
    const fans: any = {
      cpu_fans: [],
      case_fans: [],
    };

    // Fans
    sensors.forEach((s) => {
      if (s.type === "Fan" || s.units === "RPM") {
        const fanData = {
          label: s.name,
          current_rpm: s.value,
          max_rpm: 0, // Unknown
          status: s.value > 0 ? "normal" : "stopped",
          is_simulated: false,
        };

        if (s.name.toLowerCase().includes("cpu")) {
          fans.cpu_fans.push(fanData);
        } else {
          fans.case_fans.push(fanData);
        }
      }
    });

    // Temperatures (Intake/Exhaust if available)
    let ambient = 0;
    let intake = 0;
    let exhaust = 0;

    sensors.forEach((s) => {
      const name = s.name.toLowerCase();
      if (s.type === "Temperature" || s.units === "C") {
        if (name.includes("inlet") || name.includes("intake")) intake = s.value;
        if (name.includes("exhaust")) exhaust = s.value;
        if (name.includes("ambient") || name.includes("system temp"))
          ambient = s.value;
      }
    });

    return {
      is_simulated: false,
      temperature: {
        ambient_celsius: ambient || 22, // Fallback if 0
        intake_celsius: intake,
        exhaust_celsius: exhaust,
      },
      cooling: {
        fans: [...fans.cpu_fans, ...fans.case_fans], // Combined or structure matches types
      },
      chassis: {
        intrusion_detected: chassis.chassis_intrusion === "active",
        door_status: chassis.chassis_intrusion === "active" ? "open" : "closed",
      },
    };
  }

  private mapIPMISecurity(chassis: any): any {
    return {
      is_simulated: false,
      // We can only really map intrusion here
      // other security metrics (login attempts) are OS level, not IPMI
    };
  }

  public getMetrics(): Partial<HardwareHealth> {
    return this.latestMetrics;
  }

  public getEnvironment(): any {
    return this.latestEnvironment;
  }
}
