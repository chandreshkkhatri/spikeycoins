"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import Table from "@/components/ui/Table";
import { RefreshCw, Shield, Users, Server, DollarSign, FileText } from "lucide-react";
import api from "@/lib/api";

interface User {
  _id: string;
  email: string;
  name: string;
  role: string;
  isEmailVerified: boolean;
  createdAt: string;
}

interface SystemStatus {
  uptime: number;
  process: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
    external: string;
  };
  system: {
    total: string;
    free: string;
    usedPercent: string;
  };
  services?: {
    dataManager?: { tickerCount: number };
    candlestickStorage?: { symbolCount: number; cacheEntries: number };
  };
  nodeVersion: string;
  platform: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const checkAdminStatus = useCallback(async () => {
    try {
      const response = await api.get("/admin/status");
      if (response.data.isAdmin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, systemRes] = await Promise.all([
        api.get("/admin/users"),
        api.get("/admin/system"),
      ]);
      setUsers(usersRes.data.users || []);
      setSystemStatus(systemRes.data);
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin, fetchData]);

  const syncMarketCap = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await api.post("/admin/sync-marketcap");
      setSyncResult(`Synced ${response.data.symbolsWithMarketCap} symbols`);
    } catch (error) {
      setSyncResult("Sync failed. Check console.");
      console.error("Market cap sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      fetchData();
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Shield className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Admin Access Required</h2>
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
        <Button onClick={() => router.push("/")}>Go Home</Button>
      </div>
    );
  }

  const userColumns = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (value: string) => (
        <Badge variant={value === "admin" ? "success" : "neutral"}>
          {value}
        </Badge>
      ),
    },
    {
      key: "isEmailVerified",
      header: "Verified",
      render: (value: boolean) => (value ? "✓" : "✗"),
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "_id",
      header: "Actions",
      render: (_value: string, row: User) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateUserRole(row._id, row.role === "admin" ? "user" : "admin")}
        >
          {row.role === "admin" ? "Demote" : "Promote"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Market Cap Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Market Cap Sync
            </CardTitle>
            <CardDescription>
              Manually trigger CoinGecko market cap sync
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={syncMarketCap}
              disabled={syncing}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Market Cap Data"}
            </Button>
            {syncResult && (
              <p className="mt-2 text-sm text-muted-foreground">{syncResult}</p>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {systemStatus ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uptime:</span>
                  <span>{Math.round(systemStatus.uptime / 60)} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Process RSS:</span>
                  <span>{systemStatus.process.rss}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Heap Used:</span>
                  <span>{systemStatus.process.heapUsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">System Used:</span>
                  <span>{systemStatus.system.usedPercent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Node:</span>
                  <span>{systemStatus.nodeVersion}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>

        {/* User Count */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{users.length}</div>
            <p className="text-sm text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>

        {/* Log Viewer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Logs
            </CardTitle>
            <CardDescription>
              View server logs, errors, and order activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push("/admin/logs")}
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Open Log Viewer
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>View and manage user roles</CardDescription>
        </CardHeader>
        <CardContent>
          <Table columns={userColumns} data={users} emptyMessage="No users found" />
        </CardContent>
      </Card>
    </div>
  );
}
