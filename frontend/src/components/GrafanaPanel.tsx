import React from 'react';
import { Card, Badge, Button, Space, Typography, Dropdown, Tooltip, Table } from 'antd';
import { MoreOutlined, ReloadOutlined, FullscreenOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Title, Text } = Typography;

export interface GrafanaPanelProps {
  title: string;
  subtitle?: string;
  height?: number | string;
  width?: number | string;
  children?: React.ReactNode;
  status?: 'success' | 'warning' | 'error' | 'default';
  badgeText?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onRefresh?: () => void;
  onFullscreen?: () => void;
  menuItems?: MenuProps['items'];
}

export const GrafanaPanel: React.FC<GrafanaPanelProps> = ({
  title,
  subtitle,
  height = 300,
  width = '100%',
  children,
  status = 'default',
  badgeText,
  actions,
  loading = false,
  className,
  style,
  onRefresh,
  onFullscreen,
  menuItems
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#52c41a';
      case 'warning': return '#faad14';
      case 'error': return '#ff4d4f';
      default: return '#1890ff';
    }
  };

  const dropdownItems: MenuProps['items'] = menuItems || [
    {
      key: 'refresh',
      label: 'Refresh',
      icon: <ReloadOutlined />,
      onClick: onRefresh
    },
    {
      key: 'fullscreen',
      label: 'Fullscreen',
      icon: <FullscreenOutlined />,
      onClick: onFullscreen
    },
    {
      type: 'divider'
    },
    {
      key: 'view',
      label: 'View',
      children: [
        {
          key: 'json',
          label: 'View JSON'
        },
        {
          key: 'inspect',
          label: 'Inspect'
        }
      ]
    }
  ];

  return (
    <Card
      className={`grafana-panel ${className || ''}`}
      style={{
        width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: '4px',
        border: '1px solid #e8e8e8',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        ...style
      }}
      bodyStyle={{
        padding: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
      loading={loading}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#fafafa',
          borderBottom: '1px solid #e8e8e8',
          minHeight: '40px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          {status !== 'default' && (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(status)
              }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <Title
              level={5}
              style={{
                margin: 0,
                color: '#262626',
                fontSize: '14px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {title}
            </Title>
            {subtitle && (
              <Text
                type="secondary"
                style={{
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {subtitle}
              </Text>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {badgeText && (
            <Badge
              count={badgeText}
              style={{
                backgroundColor: status === 'error' ? '#ff4d4f' : status === 'warning' ? '#faad14' : '#52c41a',
                fontSize: '11px',
                lineHeight: '16px',
                height: '18px'
              }}
            />
          )}

          {actions && <Space >{actions}</Space>}

          <Dropdown
            menu={{ items: dropdownItems }}
            trigger={['click']}
            placement="bottomRight"
            arrow={{ pointAtCenter: true }}
          >
            <Button
              type="text"
              
              icon={<MoreOutlined />}
              style={{
                color: '#8c8c8c',
                border: 'none',
                padding: '4px 8px'
              }}
            />
          </Dropdown>
        </div>
      </div>

      {/* Panel Content */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          overflow: 'auto',
          backgroundColor: '#fff'
        }}
      >
        {children}
      </div>
    </Card>
  );
};

// Specialized panel components for common use cases
export const MetricPanel: React.FC<
  Omit<GrafanaPanelProps, 'children'> & {
    value: string | number;
    unit?: string;
    trend?: {
      value: number;
      direction: 'up' | 'down';
    };
    threshold?: {
      warning: number;
      critical: number;
    };
  }
> = ({
  title,
  value,
  unit,
  trend,
  threshold,
  ...props
}) => {
  const getStatus = () => {
    if (!threshold) return 'default';
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (numValue >= threshold.critical) return 'error';
    if (numValue >= threshold.warning) return 'warning';
    return 'success';
  };

  const getTrendColor = () => {
    if (!trend) return undefined;
    return trend.direction === 'up' ? '#ff4d4f' : '#52c41a';
  };

  return (
    <GrafanaPanel
      title={title}
      status={getStatus()}
      {...props}
      style={{ ...props.style, textAlign: 'center' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#262626', lineHeight: 1 }}>
          {value}
          {unit && <span style={{ fontSize: '16px', fontWeight: 'normal', marginLeft: '4px' }}>{unit}</span>}
        </div>
        {trend && (
          <div style={{ marginTop: '8px', color: getTrendColor(), fontSize: '12px' }}>
            {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
    </GrafanaPanel>
  );
};

export const TablePanel: React.FC<
  Omit<GrafanaPanelProps, 'children'> & {
    columns: Array<{
      title: string;
      dataIndex: string;
      key: string;
      render?: (value: any, record: any) => React.ReactNode;
    }>;
    dataSource: any[];
    pagination?: boolean;
  }
> = ({ title, columns, dataSource, pagination = false, ...props }) => {
  return (
    <GrafanaPanel title={title} {...props}>
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={pagination ? {} : false}
        
        scroll={{ y: 'calc(100% - 40px)' }}
        style={{ fontSize: '12px' }}
      />
    </GrafanaPanel>
  );
};

export default GrafanaPanel;