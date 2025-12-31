import React from "react";
import {
  Row,
  Col,
  Card,
  Typography,
  Space,
  Statistic,
  Progress,
  Alert,
  Tag,
  Divider,
  Table,
  Radio,
} from "antd";
import ReactECharts from "echarts-for-react";
import { GrafanaPanel } from "./GrafanaPanel";
import { useMockData } from "../hooks/useMockData";
import {
  ThunderboltOutlined,
  FireOutlined,
  DatabaseOutlined,
  HddOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

export const HardwareTrends: React.FC = () => {
  const { servers, trends } = useMockData();
  const [timeRange, setTimeRange] = React.useState<number>(10); // Default 10 minutes

  // Prepare chart data
  const prepareTimeSeriesData = (trendKey: string) => {
    const trendData = trends[trendKey];
    if (!trendData) return [];

    // Backend provides up to 60 min. Slice based on selected range.
    // range in minutes. 1 min = 60 points (assuming 1s interval)
    // Actually timestamp comparison is safer than assuming index count.
    const cutoff = Date.now() - timeRange * 60 * 1000;

    return trendData.data
      .filter((p) => new Date(p.timestamp).getTime() > cutoff)
      .map((point) => [point.timestamp, point.value]);
  };

  const prepareServerComparisonData = (metric: string) => {
    return servers
      .map((server) => {
        let value = 0;
        switch (metric) {
          case "cpu":
            value = server.hardware.cpu.utilization_percent;
            break;
          case "memory":
            value = server.hardware.memory.usage_percent;
            break;
          case "temperature":
            value = server.hardware.cpu.temperature_celsius.package;
            break;
          case "storage":
            value = server.hardware.storage.devices[0]?.usage_percent || 0;
            break;
          default:
            value = 0;
        }

        return {
          name: server.hostname,
          value: Math.round(value * 10) / 10,
          status: server.status,
        };
      })
      .sort((a, b) => b.value - a.value);
  };

  const getHealthStatusData = () => {
    const statusCount = {
      healthy: servers.filter((s) => s.status === "healthy").length,
      warning: servers.filter((s) => s.status === "warning").length,
      critical: servers.filter((s) => s.status === "critical").length,
    };

    return [
      {
        name: "Healthy",
        value: statusCount.healthy,
        itemStyle: { color: "#52c41a" },
      },
      {
        name: "Warning",
        value: statusCount.warning,
        itemStyle: { color: "#faad14" },
      },
      {
        name: "Critical",
        value: statusCount.critical,
        itemStyle: { color: "#ff4d4f" },
      },
    ];
  };

  // CPU Utilization Trend Chart
  const cpuTrendOption = {
    title: {
      text: "CPU Utilization Trend",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: "normal" },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const data = params[0];
        return `CPU: ${data.value[1]}%<br/>${new Date(
          data.value[0]
        ).toLocaleString()}`;
      },
    },
    xAxis: {
      type: "time",
      splitLine: { show: false },
      min: new Date(Date.now() - timeRange * 60 * 1000),
      max: new Date(),
    },
    yAxis: {
      type: "value",
      max: 100,
      axisLabel: { formatter: "{value}%" },
      splitLine: { lineStyle: { type: "dashed" } },
    },
    animation: false,
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: "#1890ff" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(24, 144, 255, 0.3)" },
              { offset: 1, color: "rgba(24, 144, 255, 0.05)" },
            ],
          },
        },
        data: prepareTimeSeriesData("cpu"),
      },
    ],
    grid: { top: 40, right: 20, bottom: 30, left: 50 },
  };

  // Memory Usage Trend Chart
  const memoryTrendOption = {
    ...cpuTrendOption,
    title: {
      text: "Memory Usage Trend",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: "normal" },
    },
    series: [
      {
        ...cpuTrendOption.series[0],
        lineStyle: { width: 2, color: "#52c41a" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(82, 196, 26, 0.3)" },
              { offset: 1, color: "rgba(82, 196, 26, 0.05)" },
            ],
          },
        },
        data: prepareTimeSeriesData("memory"),
      },
    ],
  };

  // Server Comparison Chart
  const serverComparisonOption = {
    title: {
      text: "Current Server Utilization",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: "normal" },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    legend: {
      data: ["CPU", "Memory", "Temperature", "Storage"],
      bottom: 0,
    },
    xAxis: {
      type: "category",
      data: servers.map((s) => s.hostname),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
    },
    series: [
      {
        name: "CPU",
        type: "bar",
        data: prepareServerComparisonData("cpu").map((d) => d.value),
        itemStyle: { color: "#1890ff" },
      },
      {
        name: "Memory",
        type: "bar",
        data: prepareServerComparisonData("memory").map((d) => d.value),
        itemStyle: { color: "#52c41a" },
      },
      {
        name: "Temperature",
        type: "bar",
        data: prepareServerComparisonData("temperature").map(
          (d) => (d.value / 100) * 100
        ), // Normalize to percentage
        itemStyle: { color: "#faad14" },
      },
      {
        name: "Storage",
        type: "bar",
        data: prepareServerComparisonData("storage").map((d) => d.value),
        itemStyle: { color: "#722ed1" },
      },
    ],
    grid: { top: 40, right: 20, bottom: 80, left: 50 },
  };

  // Health Status Pie Chart
  const healthStatusOption = {
    title: {
      text: "Server Health Distribution",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: "normal" },
    },
    tooltip: {
      trigger: "item",
      formatter: "{a} <br/>{b}: {c} ({d}%)",
    },
    legend: {
      orient: "vertical",
      left: "left",
      top: "middle",
    },
    series: [
      {
        name: "Server Status",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["60%", "50%"],
        avoidLabelOverlap: false,
        label: {
          show: false,
          position: "center",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: "18",
            fontWeight: "bold",
          },
        },
        labelLine: { show: false },
        data: getHealthStatusData(),
      },
    ],
  };

  // Temperature Heatmap
  const tempData = servers.map((server) => [
    server.hostname,
    server.hardware.cpu.temperature_celsius.package.toFixed(1),
    server.status,
  ]);

  const temperatureOption = {
    title: {
      text: "Server Temperature Monitor",
      left: "center",
      textStyle: { fontSize: 14, fontWeight: "normal" },
    },
    tooltip: {
      position: "top",
      formatter: (params: any) => {
        return `${params.name}: ${params.value[1]}°C`;
      },
    },
    grid: {
      height: "50%",
      top: "10%",
    },
    xAxis: {
      type: "category",
      data: servers.map((s) => s.hostname),
      splitArea: { show: true },
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: {
      type: "category",
      data: ["Temperature"],
      splitArea: { show: true },
    },
    visualMap: {
      min: 20,
      max: 90,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "5%",
      inRange: {
        color: ["#50a3ba", "#eac736", "#d94e5d"],
      },
    },
    series: [
      {
        name: "Temperature",
        type: "heatmap",
        data: tempData.map((item, index) => [index, 0, parseFloat(item[1])]),
        label: { show: true },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  };

  return (
    <Row gutter={[16, 16]}>
      {/* CPU Utilization Trend */}
      <Col xs={24} lg={12}>
        <GrafanaPanel
          title="Performance Trends"
          subtitle="REAL DATA FROM HOST SYSTEM"
          height={400}
          actions={
            <Space>
              <Radio.Group
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                size="small"
                buttonStyle="solid"
              >
                <Radio.Button value={1}>1m</Radio.Button>
                <Radio.Button value={5}>5m</Radio.Button>
                <Radio.Button value={10}>10m</Radio.Button>
                <Radio.Button value={30}>30m</Radio.Button>
                <Radio.Button value={60}>1h</Radio.Button>
              </Radio.Group>
              <Tag color="success">REAL</Tag>
            </Space>
          }
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <ReactECharts
                option={cpuTrendOption}
                style={{ height: "180px" }}
                notMerge={true}
                lazyUpdate={true}
              />
            </Col>
            <Col span={24}>
              <ReactECharts
                option={memoryTrendOption}
                style={{ height: "180px" }}
                notMerge={true}
                lazyUpdate={true}
              />
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      {/* Server Comparison */}
      <Col xs={24} lg={12}>
        <GrafanaPanel
          title="Resource Utilization Comparison"
          subtitle="REAL DATA FROM HOST SYSTEM"
          height={400}
          actions={<Tag color="success">REAL</Tag>}
        >
          <ReactECharts
            option={serverComparisonOption}
            style={{ height: "100%" }}
            notMerge={true}
            lazyUpdate={true}
          />
        </GrafanaPanel>
      </Col>

      {/* Health Status Distribution */}
      <Col xs={24} lg={8}>
        <GrafanaPanel
          title="Infrastructure Health"
          actions={<Tag color="success">REAL</Tag>}
          height={350}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <ReactECharts
                option={healthStatusOption}
                style={{ height: "200px" }}
                notMerge={true}
                lazyUpdate={true}
              />
            </Col>
            <Col span={24}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <Statistic
                    title="Critical Servers"
                    value={
                      servers.filter((s) => s.status === "critical").length
                    }
                    valueStyle={{ color: "#ff4d4f", fontSize: "24px" }}
                  />
                </div>
                <div style={{ textAlign: "center" }}>
                  <Statistic
                    title="Avg CPU Load"
                    value={
                      servers.length > 0
                        ? Math.round(
                            servers.reduce(
                              (sum, s) =>
                                sum + s.hardware.cpu.utilization_percent,
                              0
                            ) / servers.length
                          )
                        : 0
                    }
                    suffix="%"
                    valueStyle={{ fontSize: "20px" }}
                  />
                </div>
              </Space>
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      {/* Temperature Monitoring */}
      <Col xs={24} lg={16}>
        <GrafanaPanel
          title="Thermal Monitoring"
          subtitle="Real-time temperature readings (Simulated if sensors unavailable)"
          height={350}
          actions={<Tag color="orange">SIMULATED FALLBACK</Tag>}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <ReactECharts
                option={temperatureOption}
                style={{ height: "250px" }}
                notMerge={true}
                lazyUpdate={true}
              />
            </Col>
            <Col span={24}>
              <Row gutter={[16, 8]}>
                {servers
                  .filter(
                    (s) => s.hardware.cpu.temperature_celsius.package > 70
                  )
                  .slice(0, 3)
                  .map((server) => (
                    <Col xs={24} sm={8} key={server.hostname}>
                      <Card
                        style={{
                          background: "#fff2f0",
                          border: "1px solid #ffccc7",
                        }}
                      >
                        <div style={{ textAlign: "center" }}>
                          <Text strong>{server.hostname}</Text>
                          <Progress
                            percent={
                              (server.hardware.cpu.temperature_celsius.package /
                                100) *
                              100
                            }
                            format={() =>
                              `${server.hardware.cpu.temperature_celsius.package.toFixed(
                                1
                              )}°C`
                            }
                            strokeColor="#ff4d4f"
                          />
                        </div>
                      </Card>
                    </Col>
                  ))}
              </Row>
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      {/* Enhanced Storage Monitoring */}
      <Col xs={24}>
        <GrafanaPanel
          title="Comprehensive Storage Monitoring"
          subtitle="SSD/NVMe/HDD performance and usage"
          height={600}
          actions={<Tag color="success">REAL</Tag>}
        >
          <Row gutter={[16, 16]}>
            {/* Storage Device Table */}
            <Col span={24}>
              <Card title="Storage Device Details" size="small">
                <Table
                  dataSource={servers.flatMap((server) =>
                    server.hardware.storage.devices.map((device, idx) => ({
                      key: `${server.hostname}-${idx}`,
                      server: server.hostname,
                      device: device.device,
                      model: device.model,
                      type: device.drive_type.toUpperCase(),
                      capacity: `${device.size_gb}GB`,
                      used: `${
                        device.used_gb
                      }GB (${device.usage_percent.toFixed(1)}%)`,
                      temperature: `${device.temperature_celsius.toFixed(1)}°C`,
                      fluctuation: `±${device.temperature_fluctuation_5min.toFixed(
                        1
                      )}°C`,
                      tbw: device.tbw_total
                        ? `${device.tbw_written.toFixed(2)} / ${
                            device.tbw_total
                          }TB (${device.tbw_percentage}%)`
                        : "N/A",
                      readIops: `${device.current_read_iops.toLocaleString()} (peak: ${device.read_iops_peak.toLocaleString()})`,
                      writeIops: `${device.current_write_iops.toLocaleString()} (peak: ${device.write_iops_peak.toLocaleString()})`,
                      status: device.smart_status,
                      statusTag: (
                        <Tag
                          color={
                            device.smart_status === "healthy"
                              ? "green"
                              : device.smart_status === "warning"
                              ? "orange"
                              : "red"
                          }
                        >
                          {device.smart_status.toUpperCase()}
                        </Tag>
                      ),
                    }))
                  )}
                  columns={[
                    { title: "Server", dataIndex: "server", width: 120 },
                    { title: "Device", dataIndex: "device", width: 100 },
                    { title: "Model", dataIndex: "model", width: 150 },
                    {
                      title: "Type",
                      dataIndex: "type",
                      width: 80,
                      render: (type: string) => (
                        <Tag
                          color={
                            type === "NVME"
                              ? "blue"
                              : type === "SSD"
                              ? "green"
                              : "orange"
                          }
                        >
                          {type}
                        </Tag>
                      ),
                    },
                    { title: "Capacity", dataIndex: "capacity", width: 100 },
                    { title: "Usage", dataIndex: "used", width: 120 },
                    {
                      title: "Temp",
                      dataIndex: "temperature",
                      width: 100,
                      render: (temp: string, record: any) => {
                        const tempVal = parseFloat(temp);
                        const color =
                          tempVal > 70
                            ? "#ff4d4f"
                            : tempVal > 60
                            ? "#faad14"
                            : "#52c41a";
                        return <span style={{ color }}>{temp}</span>;
                      },
                    },
                    {
                      title: "Fluctuation",
                      dataIndex: "fluctuation",
                      width: 120,
                    },
                    { title: "TBW Used", dataIndex: "tbw", width: 180 },
                    { title: "Read IOPS", dataIndex: "readIops", width: 200 },
                    { title: "Write IOPS", dataIndex: "writeIops", width: 200 },
                    {
                      title: "Status",
                      dataIndex: "statusTag",
                      width: 100,
                    },
                  ]}
                  size="small"
                  scroll={{ x: 1400 }}
                  pagination={{ pageSize: 10, size: "small" }}
                />
              </Card>
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      {/* Power Supply & Cooling Monitoring */}
      <Col xs={24} lg={12}>
        <GrafanaPanel
          title="Power Supply Monitoring"
          subtitle="PSU status, voltage levels, and power consumption (SIMULATED)"
          height={400}
          actions={<Tag color="blue">SIMULATED</Tag>}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {servers.slice(0, 3).map((server, idx) => (
                  <Card
                    key={server.hostname}
                    size="small"
                    title={server.hostname}
                  >
                    <Row gutter={16}>
                      <Col span={12}>
                        <Space direction="vertical">
                          <div>
                            <Text type="secondary">PSU Status</Text>
                            <div>
                              {server.hardware.power.psu_status.map(
                                (status, i) => (
                                  <Tag
                                    key={i}
                                    color={
                                      status === "healthy"
                                        ? "green"
                                        : status === "warning"
                                        ? "orange"
                                        : "red"
                                    }
                                    style={{ margin: "2px" }}
                                  >
                                    PSU{i + 1}: {status.toUpperCase()}
                                  </Tag>
                                )
                              )}
                            </div>
                          </div>
                          <div>
                            <Text type="secondary">Power Consumption</Text>
                            <div
                              style={{ fontSize: "16px", fontWeight: "bold" }}
                            >
                              <ThunderboltOutlined
                                style={{ color: "#1890ff" }}
                              />{" "}
                              {server.hardware.power.power_consumption_watts.toFixed(
                                1
                              )}
                              W
                              <Text
                                type="secondary"
                                style={{ fontSize: "12px", marginLeft: "8px" }}
                              >
                                (peak:{" "}
                                {server.hardware.power.power_consumption_peak_watts.toFixed(
                                  1
                                )}
                                W)
                              </Text>
                            </div>
                          </div>
                          <div>
                            <Text type="secondary">Efficiency</Text>
                            <Progress
                              percent={
                                server.hardware.power.power_efficiency_percent
                              }
                              size="small"
                              strokeColor={
                                server.hardware.power.power_efficiency_percent >
                                85
                                  ? "#52c41a"
                                  : "#faad14"
                              }
                            />
                          </div>
                        </Space>
                      </Col>
                      <Col span={12}>
                        <Space direction="vertical">
                          <Text strong>Voltage Levels</Text>
                          <div style={{ fontSize: "12px" }}>
                            <div>
                              3.3V:{" "}
                              {server.hardware.power.voltage_levels[
                                "3.3v"
                              ].toFixed(2)}
                              V
                            </div>
                            <div>
                              5V:{" "}
                              {server.hardware.power.voltage_levels[
                                "5v"
                              ].toFixed(2)}
                              V
                            </div>
                            <div>
                              12V:{" "}
                              {server.hardware.power.voltage_levels[
                                "12v"
                              ].toFixed(2)}
                              V
                            </div>
                          </div>
                          <Divider style={{ margin: "8px 0" }} />
                          <Text strong>Fluctuation (5s peak)</Text>
                          <div style={{ fontSize: "12px" }}>
                            <div>
                              3.3V: ±
                              {server.hardware.power.voltage_levels[
                                "3.3v_fluctuation"
                              ].toFixed(2)}
                              V
                            </div>
                            <div>
                              5V: ±
                              {server.hardware.power.voltage_levels[
                                "5v_fluctuation"
                              ].toFixed(2)}
                              V
                            </div>
                            <div>
                              12V: ±
                              {server.hardware.power.voltage_levels[
                                "12v_fluctuation"
                              ].toFixed(2)}
                              V
                            </div>
                          </div>
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </Space>
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      <Col xs={24} lg={12}>
        <GrafanaPanel
          title="Cooling System Monitoring"
          subtitle="Fan speeds and thermal management (SIMULATED)"
          height={400}
          actions={<Tag color="blue">SIMULATED</Tag>}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {servers.slice(0, 3).map((server, idx) => (
                  <Card
                    key={server.hostname}
                    size="small"
                    title={server.hostname}
                  >
                    <Row gutter={16}>
                      <Col span={12}>
                        <Text strong>CPU Cooling</Text>
                        <Divider style={{ margin: "8px 0" }} />
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {server.hardware.power.fans?.cpu_fans?.map(
                            (fan, i) => (
                              <div key={i}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text type="secondary">{fan.label}</Text>
                                  <Tag
                                    color={
                                      fan.status === "normal"
                                        ? "green"
                                        : fan.status === "warning"
                                        ? "orange"
                                        : "red"
                                    }
                                  >
                                    {fan.status.toUpperCase()}
                                  </Tag>
                                </div>
                                <Progress
                                  percent={fan.speed_percent}
                                  size="small"
                                  format={() => `${fan.current_rpm} RPM`}
                                  strokeColor={
                                    fan.speed_percent > 80
                                      ? "#ff4d4f"
                                      : fan.speed_percent > 60
                                      ? "#faad14"
                                      : "#52c41a"
                                  }
                                />
                                <Text
                                  type="secondary"
                                  style={{ fontSize: "11px" }}
                                >
                                  Target: {fan.target_rpm} RPM | Fluctuation: ±
                                  {fan.speed_fluctuation_5min.toFixed(0)} RPM
                                </Text>
                              </div>
                            )
                          )}
                        </Space>
                      </Col>
                      <Col span={12}>
                        <Text strong>Chassis Cooling</Text>
                        <Divider style={{ margin: "8px 0" }} />
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {server.environment?.cooling?.fans?.map((fan, i) => (
                            <div key={i}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <Text type="secondary">{fan.label}</Text>
                                <Tag
                                  color={
                                    fan.status === "normal" ? "green" : "orange"
                                  }
                                >
                                  {fan.status.toUpperCase()}
                                </Tag>
                              </div>
                              <Progress
                                percent={fan.speed_percent}
                                size="small"
                                format={() => `${fan.current_rpm} RPM`}
                                strokeColor={
                                  fan.speed_percent > 80
                                    ? "#ff4d4f"
                                    : fan.speed_percent > 60
                                    ? "#faad14"
                                    : "#52c41a"
                                }
                              />
                              <Text
                                type="secondary"
                                style={{ fontSize: "11px" }}
                              >
                                Efficiency: {fan.efficiency_percent}% | Temp
                                Correlated:{" "}
                                {fan.temperature_correlated ? "Yes" : "No"}
                              </Text>
                            </div>
                          ))}
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </Space>
            </Col>
          </Row>
        </GrafanaPanel>
      </Col>

      {/* High-Frequency Performance Peaks */}
      <Col xs={24}>
        <GrafanaPanel
          title="High-Frequency Performance Peaks (5s intervals)"
          subtitle="Peak performance capture (MIXED DATA)"
          height={300}
          actions={<Tag color="purple">MIXED</Tag>}
        >
          <Row gutter={[16, 16]}>
            {servers.slice(0, 4).map((server) => (
              <Col xs={24} sm={12} lg={6} key={server.hostname}>
                <Card
                  title={server.hostname}
                  size="small"
                  extra={
                    <Tag
                      color={
                        server.status === "healthy"
                          ? "green"
                          : server.status === "warning"
                          ? "orange"
                          : "red"
                      }
                    >
                      {server.status.toUpperCase()}
                    </Tag>
                  }
                >
                  <Row gutter={[8, 8]}>
                    <Col span={12}>
                      <Statistic
                        title="CPU Peak (Real)"
                        value={server.hardware.cpu.utilization_percent}
                        suffix="%"
                        valueStyle={{ fontSize: "18px", color: "#1890ff" }}
                        titleStyle={{ fontSize: "12px" }}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Temp Peak (Sim)"
                        value={server.hardware.cpu.temperature_celsius.package.toFixed(
                          1
                        )}
                        suffix="°C"
                        valueStyle={{ fontSize: "18px", color: "#fa541c" }}
                        titleStyle={{ fontSize: "12px" }}
                      />
                    </Col>
                    <Col span={24}>
                      <Text type="secondary">Storage IOPS Peaks</Text>
                      <div style={{ fontSize: "12px", marginTop: "4px" }}>
                        <div>
                          Read:{" "}
                          {server.hardware.storage.devices[0]?.read_iops_peak.toLocaleString() ||
                            0}
                        </div>
                        <div>
                          Write:{" "}
                          {server.hardware.storage.devices[0]?.write_iops_peak.toLocaleString() ||
                            0}
                        </div>
                      </div>
                    </Col>
                    <Col span={24}>
                      <Text type="secondary">Power Peak (Sim)</Text>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "bold",
                          color: "#52c41a",
                        }}
                      >
                        {server.hardware.power.power_consumption_peak_watts.toFixed(
                          1
                        )}
                        W
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>
        </GrafanaPanel>
      </Col>
    </Row>
  );
};

export default HardwareTrends;
