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

    const protocol = process.env.TRUENAS_PROTOCOL || "ws";
    const url = `${protocol}://${this.host}/websocket`;
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
    let authMethod = "auth.login_with_api_key";
    let authParams: any[] = [this.token];

    // Attempt to detect if token is Base64 encoded "user:password"
    try {
      const decoded = Buffer.from(this.token, "base64").toString("utf-8");
      if (decoded.includes(":") && !this.token.startsWith("1-")) {
        const [user, ...passParts] = decoded.split(":");
        const pass = passParts.join(":");
        if (user && pass) {
          console.log("Detected Username/Password authentication");
          authMethod = "auth.login";
          authParams = [user, pass];
        }
      }
    } catch (e) {
      // Not base64 or invalid, treat as API Key
    }

    this.send({
      id: "auth_request",
      msg: "method",
      method: authMethod,
      params: authParams,
    });
  }

  private onMessage(data: WebSocket.RawData) {
    try {
      const msg = JSON.parse(data.toString());
      console.log(
        "DEBUG: WS Message Received:",
        JSON.stringify(msg).substring(0, 200)
      ); // Log part of message

      if (msg.msg === "result") {
        // Handle Auth Result
        if (msg.id === "auth_request") {
          if (msg.result === true) {
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
          } else {
            console.error("TrueNAS Auth FAILED:", JSON.stringify(msg));
          }
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

    // Consistency Fix: Ensure IPMI temperature persists if Realtime stream sends 0
    if (cpuMetrics.temperature_celsius.package === 0 && this.ipmiSensors) {
      const cpuTemps = this.ipmiSensors
        .filter(
          (s) =>
            s.name.toLowerCase().includes("cpu") &&
            s.name.toLowerCase().includes("temp") &&
            s.type === "Temperature"
        )
        .map((s) => (s.reading === "N/A" ? 0 : parseFloat(s.reading)))
        .filter((v) => v > 0);

      if (cpuTemps.length > 0) {
        const maxTemp = Math.max(...cpuTemps);
        cpuMetrics.temperature_celsius = {
          package: maxTemp,
          cores: cpuTemps,
        };
      }
    }

    this.latestMetrics = {
      ...this.latestMetrics, // Keep IPMI data
      cpu: cpuMetrics,
      memory: memMetrics,
      network: netMetrics,
    };
  }

  private mapCPU(cpuData: any[], tempData: any): CPUMetrics {
    // cpuData: [{user, system, idle...}, ...]
    if (!cpuData || !Array.isArray(cpuData) || cpuData.length === 0)
      return {
        utilization_percent: 0,
        per_core_utilization: [],
        load_average: [0, 0, 0],
        core_count: 0,
        physical_core_count: 0,
        frequency_mhz: { base: 0, current: 0, turbo_active: false },
        temperature_celsius: { package: 0, cores: [] },
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
        },
      };

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

    console.log(
      "DEBUG: mergeIPMIData called. Sensors count:",
      this.ipmiSensors?.length,
      "Chassis:",
      this.ipmiChassis ? "Yes" : "No"
    );

    // Log all sensor names/values to find Power sensor
    if (this.ipmiSensors && this.ipmiSensors.length > 0) {
      const sensorSummary = this.ipmiSensors
        .map((s) => `${s.name}=${s.reading}`)
        .join(", ");
      console.log("DEBUG: All IPMI Sensors:", sensorSummary);
    }

    const powerMetrics = this.mapIPMIPower(
      this.ipmiSensors || [],
      this.ipmiChassis || {}
    );
    const envMetrics = this.mapIPMIEnvironment(
      this.ipmiSensors || [],
      this.ipmiChassis || {}
    );
    const securityMetrics = this.mapIPMISecurity(this.ipmiChassis || {});

    console.log("DEBUG: Computed PowerMetrics:", JSON.stringify(powerMetrics));

    // Update latestMetrics with new IPMI info
    this.latestMetrics = {
      ...this.latestMetrics,
      power: powerMetrics,
      security: {
        ...(this.latestMetrics.security as any),
        ...securityMetrics,
      } as any,
    };

    // Backfill CPU Temperature from IPMI if realtime stream is missing it
    if (
      this.latestMetrics.cpu &&
      this.latestMetrics.cpu.temperature_celsius.package === 0
    ) {
      // Collect CPU temps from IPMI sensors
      const cpuTemps = (this.ipmiSensors || [])
        .filter(
          (s) =>
            s.name.toLowerCase().includes("cpu") &&
            s.name.toLowerCase().includes("temp") &&
            s.type === "Temperature"
        )
        .map((s) => (s.reading === "N/A" ? 0 : parseFloat(s.reading)))
        .filter((v) => v > 0);

      if (cpuTemps.length > 0) {
        const maxTemp = Math.max(...cpuTemps);
        this.latestMetrics.cpu.temperature_celsius = {
          package: maxTemp,
          cores: cpuTemps,
        };
      }
    }

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
      // Parse reading (handle "N/A")
      let val = 0;
      if (s.reading !== "N/A") {
        val = parseFloat(s.reading);
      }

      // Power
      if (
        name.includes("pwr consumption") ||
        name.includes("system power") ||
        name.includes("total_power")
      ) {
        power_watts = val;
      }

      // Voltages
      if (name.includes("3.3v") && !name.includes("batt"))
        voltage_levels["3.3v"] = val;
      if (name.includes("5v") && !name.includes("dual"))
        voltage_levels["5v"] = val;
      if (name.includes("12v")) voltage_levels["12v"] = val;

      // PSU Status
      // Logic: If PSU*_Supply status is present, use it.
      // If not, use PSU*_Power reading to infer status.
      if (name.includes("psu") && name.includes("power")) {
        // e.g. PSU1_Power=235.00 -> Healthy
        // PSU0_Power=N/A -> Critical/Missing
        if (s.reading === "N/A" || val === 0) {
          // Likely missing or off
          // We won't push to psu_status here directly to avoid duplicates if Supply sensor also exists,
          // But if we have no status yet for this PSU index...
          // Let's rely on a simpler approach: accumulate PSU status logic.
        } else {
          // Has power -> Healthy
        }
      }

      // We explicitly check for Supply/Status sensors first
      if (
        name.includes("psu") &&
        (name.includes("status") || name.includes("supply"))
      ) {
        psu_count++;
        const statusVal = String(s.reading || "").toLowerCase();
        if (statusVal === "n/a") {
          psu_status.push("critical"); // Or unknown
        } else if (statusVal.includes("ok") || statusVal.includes("presence")) {
          psu_status.push("healthy");
        } else {
          psu_status.push("critical");
        }
      }
      // Fallback: If we have PSU*_Power sensors but NO status sensors found (count still 0 at end?)
      // Actually, let's just use the Power reading for "Healthy" if we haven't found status.

      // Fans (Backward compatibility for PowerMetrics)
      // Check for FAN_X pattern or "Fan" type
      if (s.type === "Fan" || s.units === "RPM" || name.startsWith("fan_")) {
        const fanData = {
          label: s.name,
          current_rpm: val,
          max_rpm: 0,
          status: val > 0 ? "normal" : "stopped",
          is_simulated: false,
        };

        if (name.includes("cpu")) {
          fans.cpu_fans.push(fanData);
        } else {
          fans.case_fans.push(fanData);
        }
      }
    });

    // Post-processing for PSUs if only Power sensors were found?
    // User logs show: PSU0_Power=N/A, PSU1_Power=235.00. PSU0_Supply=N/A.
    // If PSU0_Supply=N/A, we pushed generic "critical" above?
    // Let's refine PSU logic.
    // If psu_status is empty or all "critical" because of N/A, maybe look at Power vals.
    if (psu_status.length === 0 || psu_status.every((s) => s === "critical")) {
      // Try to derive from Power watts
      sensors.forEach((s) => {
        if (
          s.name.toLowerCase().includes("psu") &&
          s.name.toLowerCase().includes("power")
        ) {
          const v = s.reading === "N/A" ? 0 : parseFloat(s.reading);
          if (v > 0) psu_status.push("healthy");
          else psu_status.push("critical");
        }
      });
      if (psu_status.length > 0) psu_count = psu_status.length;
    }

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
      const name = s.name.toLowerCase();
      // Fan checks
      if (s.type === "Fan" || s.units === "RPM" || name.startsWith("fan_")) {
        const val = s.reading === "N/A" ? 0 : parseFloat(s.reading);
        const fanData = {
          label: s.name,
          current_rpm: val,
          max_rpm: 0, // Unknown
          status: val > 0 ? "normal" : "stopped",
          is_simulated: false,
        };

        if (name.includes("cpu")) {
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
