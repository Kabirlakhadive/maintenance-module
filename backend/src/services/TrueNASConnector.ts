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
  private reconnectInterval: NodeJS.Timeout | null = null;

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
      id: this.generateId(),
      msg: "method",
      method: "auth.login_with_token",
      params: [this.token],
    });
  }

  private onMessage(data: WebSocket.RawData) {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.msg === "result" && msg.result === true) {
        // Likely auth success or sub success
        if (!this.isAuthenticated) {
          console.log("TrueNAS Auth Successful (Presumed)");
          this.isAuthenticated = true;
          this.subscribeToMetrics();
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

  private subscribeToMetrics() {
    console.log("Subscribing to reporting.realtime...");
    this.send({
      id: this.generateId(),
      msg: "sub",
      name: "reporting.realtime",
    });
  }

  private onClose() {
    console.log("TrueNAS WS Closed. Reconnecting in 5s...");
    this.isConnected = false;
    this.isAuthenticated = false;
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
      cpu: cpuMetrics,
      memory: memMetrics,
      network: netMetrics,
      // Keep existing simulated data for power/fan if not present in realtime
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

  public getMetrics(): Partial<HardwareHealth> {
    return this.latestMetrics;
  }
}
