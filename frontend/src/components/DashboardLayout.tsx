import React, { useState } from 'react';
import { Layout, Row, Col, Card, Typography, Space, Button, Badge, Tooltip, Switch, Dropdown } from 'antd';
import { ReloadOutlined, SettingOutlined, BellOutlined, FullscreenOutlined } from '@ant-design/icons';
import { GrafanaPanel, MetricPanel } from './GrafanaPanel';
import { useMockData } from '../hooks/useMockData';
import type { MenuProps } from 'antd';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { stats, lastUpdate, refreshData } = useMockData();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const handleManualRefresh = () => {
    refreshData();
  };

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const dropdownItems: MenuProps['items'] = [
    {
      key: 'settings',
      label: 'Dashboard Settings',
      icon: <SettingOutlined />,
      children: [
        {
          key: 'refresh',
          label: 'Auto-refresh',
          extra: <Switch checked={autoRefresh} onChange={setAutoRefresh}  />
        },
        {
          key: 'theme',
          label: 'Theme',
          children: [
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
            { key: 'auto', label: 'Auto' }
          ]
        }
      ]
    },
    {
      key: 'export',
      label: 'Export',
      children: [
        { key: 'pdf', label: 'Export as PDF' },
        { key: 'png', label: 'Export as PNG' },
        { key: 'csv', label: 'Export data as CSV' }
      ]
    },
    {
      type: 'divider'
    },
    {
      key: 'help',
      label: 'Help',
      children: [
        { key: 'docs', label: 'Documentation' },
        { key: 'support', label: 'Support' },
        { key: 'shortcuts', label: 'Keyboard Shortcuts' }
      ]
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <Header
        style={{
          background: '#001529',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Title level={3} style={{ color: 'white', margin: 0, fontSize: '20px' }}>
            PT1 Server Telemetry
          </Title>
          <Badge
            count={stats.totalAlerts}
            style={{
              backgroundColor: stats.totalAlerts > 0 ? '#ff4d4f' : '#52c41a'
            }}
          >
            <BellOutlined style={{ color: 'white', fontSize: '16px' }} />
          </Badge>
        </div>

        <Space size="large">
          <Space >
            <Text style={{ color: '#8c8c8c', fontSize: '12px' }}>
              Last updated:
            </Text>
            <Text style={{ color: 'white', fontSize: '12px' }}>
              {formatLastUpdate(lastUpdate)}
            </Text>
          </Space>

          <Space >
            <Text style={{ color: '#8c8c8c', fontSize: '12px' }}>
              Auto-refresh:
            </Text>
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              
            />
          </Space>

          <Tooltip title="Refresh data">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={handleManualRefresh}
              style={{ color: 'white', border: 'none' }}
            >
              Refresh
            </Button>
          </Tooltip>

          <Tooltip title="Fullscreen">
            <Button
              type="text"
              icon={<FullscreenOutlined />}
              style={{ color: 'white', border: 'none' }}
            />
          </Tooltip>

          <Badge dot={stats.totalAlerts > 0}>
            <Button
              type="text"
              icon={<BellOutlined />}
              style={{ color: 'white', border: 'none' }}
            />
          </Badge>
        </Space>
      </Header>

      {/* Main Content */}
      <Content style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
        {/* Executive Summary Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <MetricPanel
              title="Infrastructure Health"
              value={stats.healthScore}
              unit="%"
              status={stats.healthScore >= 90 ? 'success' : stats.healthScore >= 70 ? 'warning' : 'error'}
              badgeText={`${stats.healthyServers} Healthy`}
              height={120}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <MetricPanel
              title="Server Status"
              value={stats.totalServers}
              unit="servers"
              subtitle={`${stats.criticalServers} Critical`}
              status={stats.criticalServers > 0 ? 'error' : stats.warningServers > 0 ? 'warning' : 'success'}
              badgeText={`${stats.warningServers} Warning`}
              height={120}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <MetricPanel
              title="Average CPU Load"
              value={stats.avgCPU}
              unit="%"
              status={stats.avgCPU >= 85 ? 'error' : stats.avgCPU >= 70 ? 'warning' : 'success'}
              trend={{
                value: Math.random() * 10 - 5, // Random trend for demo
                direction: Math.random() > 0.5 ? 'up' : 'down'
              }}
              threshold={{ warning: 70, critical: 85 }}
              height={120}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <MetricPanel
              title="Average Memory Usage"
              value={stats.avgMemory}
              unit="%"
              status={stats.avgMemory >= 90 ? 'error' : stats.avgMemory >= 80 ? 'warning' : 'success'}
              threshold={{ warning: 80, critical: 90 }}
              height={120}
            />
          </Col>
        </Row>

        {/* Main Dashboard Content */}
        {children || (
          <Row gutter={[16, 16]}>
            {/* Default welcome message if no children */}
            <Col span={24}>
              <Card style={{ textAlign: 'center', padding: '60px' }}>
                <Title level={2}>PT1 Preventive Maintenance Dashboard</Title>
                <Text type="secondary">
                  Select a dashboard view from the navigation or add components to display telemetry data
                </Text>
              </Card>
            </Col>
          </Row>
        )}
      </Content>
    </Layout>
  );
};

export default DashboardLayout;