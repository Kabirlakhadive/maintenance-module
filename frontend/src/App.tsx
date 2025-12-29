import React, { useState } from "react";
import { Layout, Tabs, Space } from "antd";
import { DashboardOutlined, ClusterOutlined } from "@ant-design/icons";
import DashboardLayout from "./components/DashboardLayout";
import ServerGrid from "./components/ServerGrid";
import HardwareTrends from "./components/HardwareTrends";
import "./App.css";

const { Content } = Layout;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("overview");

  const tabItems = [
    {
      key: "overview",
      label: (
        <Space>
          <DashboardOutlined />
          Overview
        </Space>
      ),
      children: <ServerGrid />,
    },
    {
      key: "hardware",
      label: (
        <Space>
          <ClusterOutlined />
          Hardware
        </Space>
      ),
      children: <HardwareTrends />,
    },
  ];

  return (
    <DashboardLayout>
      <Content style={{ paddingBottom: 24 }}>
        {/* Tab Navigation */}
        <div
          style={{
            backgroundColor: "#fff",
            marginBottom: 16,
            borderRadius: "4px",
          }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            size="large"
            tabBarStyle={{
              padding: "0 24px",
              margin: 0,
              borderBottom: "1px solid #f0f0f0",
            }}
          />
        </div>

        {/* Tab Content within Tabs component */}
      </Content>
    </DashboardLayout>
  );
};

export default App;
