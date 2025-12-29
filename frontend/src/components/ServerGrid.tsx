import React, { useState } from 'react';
import { Card, Progress, Badge, Tag, Tooltip, Modal, Descriptions, Button, Space, Typography } from 'antd';
import { DesktopOutlined, ExclamationCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { GrafanaPanel } from './GrafanaPanel';
import { useMockData } from '../hooks/useMockData';
import { ServerStatus } from '../types/telemetry';

const { Title, Text } = Typography;

interface ServerGridProps {
  onServerClick?: (server: ServerStatus) => void;
  height?: number | string;
}

export const ServerGrid: React.FC<ServerGridProps> = ({ onServerClick, height }) => {
  const { servers } = useMockData();
  const [selectedServer, setSelectedServer] = useState<ServerStatus | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'success';
      case 'warning': return 'warning';
      case 'critical': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case 'critical': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default: return <DesktopOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const getProgressStatus = (value: number, warningThreshold: number, criticalThreshold: number) => {
    if (value >= criticalThreshold) return 'exception';
    if (value >= warningThreshold) return 'active';
    return 'normal';
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  const handleServerClick = (server: ServerStatus) => {
    setSelectedServer(server);
    setDetailModalVisible(true);
    onServerClick?.(server);
  };

  const closeModal = () => {
    setDetailModalVisible(false);
    setSelectedServer(null);
  };

  const renderDetailModal = () => {
    if (!selectedServer) return null;

    const { hardware, alerts, environment } = selectedServer;

    return (
      <Modal
        title={
          <Space>
            {getStatusIcon(selectedServer.status)}
            <span>{selectedServer.hostname}</span>
            <Badge status={getStatusColor(selectedServer.status)} />
          </Space>
        }
        open={detailModalVisible}
        onCancel={closeModal}
        width={800}
        footer={[
          <Button key="close" onClick={closeModal}>
            Close
          </Button>,
          <Button key="refresh" type="primary" onClick={closeModal}>
            View Details
          </Button>
        ]}
      >
        <Descriptions bordered column={2} >
          <Descriptions.Item label="Server Type">
            {selectedServer.server_type.toUpperCase()}
          </Descriptions.Item>
          <Descriptions.Item label="OS">
            {selectedServer.os_distribution}
          </Descriptions.Item>
          <Descriptions.Item label="CPU Utilization">
            <Progress
              percent={Math.round(hardware.cpu.utilization_percent)}
              
              status={getProgressStatus(hardware.cpu.utilization_percent, 70, 85)}
            />
          </Descriptions.Item>
          <Descriptions.Item label="Memory Usage">
            <Progress
              percent={Math.round(hardware.memory.usage_percent)}
              
              status={getProgressStatus(hardware.memory.usage_percent, 80, 90)}
            />
          </Descriptions.Item>
          <Descriptions.Item label="Temperature">
            {hardware.cpu.temperature_celsius.package.toFixed(1)}°C
          </Descriptions.Item>
          <Descriptions.Item label="Power Usage">
            {hardware.power.power_consumption_watts.toFixed(1)}W
          </Descriptions.Item>
          <Descriptions.Item label="Active Connections" span={2}>
            {hardware.network.active_connections.tcp_established} TCP / {hardware.network.active_connections.udp_active} UDP
          </Descriptions.Item>
          <Descriptions.Item label="Storage Devices" span={2}>
            {hardware.storage.devices.map((device, idx) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                <Text strong>{device.device}</Text> ({device.model}) -{' '}
                <Progress
                  percent={Math.round(device.usage_percent)}
                  
                  style={{ width: '100px', display: 'inline-block' }}
                />
                <Text type="secondary"> {device.smart_status}</Text>
              </div>
            ))}
          </Descriptions.Item>
          {environment && (
            <>
              <Descriptions.Item label="Ambient Temp">
                {environment.temperature.ambient_celsius.toFixed(1)}°C
              </Descriptions.Item>
              <Descriptions.Item label="Chassis Fans">
                {environment.cooling.fans.length} operational
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="Active Alerts" span={2}>
            {alerts.length > 0 ? (
              <Space wrap>
                {alerts.map(alert => (
                  <Tag
                    key={alert.id}
                    color={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'orange' : 'blue'}
                  >
                    {alert.title}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">No active alerts</Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    );
  };

  return (
    <>
      <GrafanaPanel
        title="Server Infrastructure Overview"
        subtitle={`${servers.length} servers • ${servers.filter(s => s.status === 'healthy').length} healthy`}
        height={height}
        badgeText={servers.filter(s => s.status !== 'healthy').length.toString()}
        status={servers.some(s => s.status === 'critical') ? 'error' : servers.some(s => s.status === 'warning') ? 'warning' : 'success'}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
            padding: '4px'
          }}
        >
          {servers.map((server) => (
            <Card
              key={server.hostname}
              
              hoverable
              onClick={() => handleServerClick(server)}
              style={{
                cursor: 'pointer',
                borderLeft: `4px solid ${
                  server.status === 'critical' ? '#ff4d4f' :
                  server.status === 'warning' ? '#faad14' : '#52c41a'
                }`,
                transition: 'all 0.2s ease',
                backgroundColor: server.status === 'critical' ? '#fff2f0' : server.status === 'warning' ? '#fffbe6' : '#fff'
              }}
              bodyStyle={{ padding: '12px' }}
            >
              {/* Server Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getStatusIcon(server.status)}
                  <Title level={5} style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                    {server.hostname}
                  </Title>
                </div>
                <Badge status={getStatusColor(server.status)} />
              </div>

              {/* Server Info */}
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '12px' }}>
                {server.server_type.toUpperCase()} • {server.os_distribution}
              </div>

              {/* CPU Usage */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ fontSize: '12px' }}>CPU</Text>
                  <Text style={{ fontSize: '11px', color: '#666' }}>
                    {server.hardware.cpu.utilization_percent.toFixed(1)}%
                  </Text>
                </div>
                <Progress
                  percent={server.hardware.cpu.utilization_percent}
                  
                  showInfo={false}
                  status={getProgressStatus(server.hardware.cpu.utilization_percent, 70, 85)}
                  strokeWidth={6}
                />
              </div>

              {/* Memory Usage */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ fontSize: '12px' }}>Memory</Text>
                  <Text style={{ fontSize: '11px', color: '#666' }}>
                    {server.hardware.memory.used_gb.toFixed(0)}GB / {server.hardware.memory.total_gb.toFixed(0)}GB
                  </Text>
                </div>
                <Progress
                  percent={server.hardware.memory.usage_percent}
                  
                  showInfo={false}
                  status={getProgressStatus(server.hardware.memory.usage_percent, 80, 90)}
                  strokeWidth={6}
                />
              </div>

              {/* Storage Usage */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ fontSize: '12px' }}>Storage</Text>
                  <Text style={{ fontSize: '11px', color: '#666' }}>
                    {server.hardware.storage.devices[0]?.usage_percent.toFixed(0)}%
                  </Text>
                </div>
                <Progress
                  percent={server.hardware.storage.devices[0]?.usage_percent || 0}
                  
                  showInfo={false}
                  status={getProgressStatus(server.hardware.storage.devices[0]?.usage_percent || 0, 80, 90)}
                  strokeWidth={6}
                />
              </div>

              {/* Bottom Info Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#666' }}>
                <span>
                  Uptime: {formatUptime(server.hardware.cpu.uptime_seconds || 86400)}
                </span>
                <Space >
                  <Tag color="blue" >
                    {server.hardware.cpu.temperature_celsius.package.toFixed(0)}°C
                  </Tag>
                  {server.alerts.filter(a => !a.resolved).length > 0 && (
                    <Tag color="red" >
                      {server.alerts.filter(a => !a.resolved).length} alerts
                    </Tag>
                  )}
                </Space>
              </div>

              {/* Active Alerts Preview */}
              {server.alerts.filter(a => !a.resolved).length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {server.alerts
                    .filter(a => !a.resolved)
                    .slice(0, 2)
                    .map((alert, idx) => (
                      <Tag
                        key={idx}
                        color={alert.severity === 'critical' ? 'red' : 'orange'}
                        
                        style={{ fontSize: '9px', lineHeight: '14px', margin: '2px' }}
                      >
                        {alert.title}
                      </Tag>
                    ))}
                  {server.alerts.filter(a => !a.resolved).length > 2 && (
                    <Tag  style={{ fontSize: '9px', lineHeight: '14px', margin: '2px' }}>
                      +{server.alerts.filter(a => !a.resolved).length - 2} more
                    </Tag>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </GrafanaPanel>

      {renderDetailModal()}
    </>
  );
};

export default ServerGrid;