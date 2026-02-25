"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Shield,
  FileText,
  Search,
  ArrowLeft,
  ArrowDown,
  Terminal,
  Download,
} from "lucide-react";
import api from "@/lib/api";

interface LogFile {
  name: string;
  size: number;
  sizeHuman: string;
  modified: string;
  compressed: boolean;
}

interface LogResponse {
  success: boolean;
  file: string;
  totalMatching: number;
  returned: number;
  truncated: boolean;
  lines: string[];
}

type LogSource = "file" | "pm2-out" | "pm2-error";

const LEVEL_COLORS: Record<string, string> = {
  ERROR:
    "text-red-400",
  WARN:
    "text-amber-400",
  INFO:
    "text-blue-400",
  DEBUG:
    "text-neutral-500",
};

function LogLine({ line }: { line: string }) {
  // Parse log level from line like [2026-02-25 05:42:24] [INFO] ...
  const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/);
  const level = levelMatch?.[1] || "";
  const colorClass = LEVEL_COLORS[level] || "text-neutral-300 dark:text-neutral-300";

  // Highlight timestamp
  const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const rest = line.slice(timestampMatch[0].length);

    return (
      <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${colorClass}`}>
        <span className="text-neutral-500">[{timestamp}]</span>
        {rest}
      </div>
    );
  }

  // PM2-style lines (no timestamp format)
  return (
    <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${colorClass}`}>
      {line}
    </div>
  );
}

export default function AdminLogsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  // Log files list
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);

  // Current view state
  const [logSource, setLogSource] = useState<LogSource>("pm2-out");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [maxLines, setMaxLines] = useState<string>("500");

  // Log content
  const [logData, setLogData] = useState<LogResponse | null>(null);

  // Auto-scroll
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const checkAdminStatus = useCallback(async () => {
    try {
      const response = await api.get("/admin/status");
      setIsAdmin(response.data.isAdmin === true);
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogFiles = useCallback(async () => {
    try {
      const response = await api.get("/admin/logs/files");
      setLogFiles(response.data.files || []);
      // Auto-select today's application log if nothing selected
      if (!selectedFile && response.data.files?.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const todayLog = response.data.files.find(
          (f: LogFile) => f.name === `application-${today}.log`
        );
        setSelectedFile(todayLog?.name || response.data.files[0].name);
      }
    } catch (error) {
      console.error("Failed to fetch log files:", error);
    }
  }, [selectedFile]);

  const fetchLogs = useCallback(async () => {
    setFetching(true);
    try {
      let url: string;
      const params = new URLSearchParams();
      params.set("lines", maxLines);
      if (searchQuery) params.set("search", searchQuery);

      if (logSource === "file") {
        url = "/admin/logs/read";
        if (selectedFile) params.set("file", selectedFile);
        if (levelFilter && levelFilter !== "all") params.set("level", levelFilter);
      } else if (logSource === "pm2-error") {
        url = "/admin/logs/pm2";
        params.set("type", "error");
      } else {
        url = "/admin/logs/pm2";
        params.set("type", "out");
      }

      const response = await api.get(`${url}?${params.toString()}`);
      setLogData(response.data);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      setLogData(null);
    } finally {
      setFetching(false);
    }
  }, [logSource, selectedFile, levelFilter, searchQuery, maxLines]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logData, autoScroll]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchLogs, 5000);
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
        autoRefreshRef.current = null;
      }
    };
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  useEffect(() => {
    if (isAdmin) {
      fetchLogFiles();
    }
  }, [isAdmin, fetchLogFiles]);

  // Fetch logs when source/filters change
  useEffect(() => {
    if (isAdmin && (logSource !== "file" || selectedFile)) {
      fetchLogs();
    }
  }, [isAdmin, logSource, selectedFile, levelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchLogs();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      fetchLogs();
    }
  };

  const downloadLogs = () => {
    if (!logData?.lines?.length) return;
    const content = logData.lines.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        <p className="text-muted-foreground">
          You do not have permission to access this page.
        </p>
        <Button onClick={() => router.push("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Admin
        </Button>
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Log Viewer</h1>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Log Source */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Source</label>
              <Select
                value={logSource}
                onValueChange={(v) => setLogSource(v as LogSource)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pm2-out">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="h-3 w-3" />
                      PM2 stdout
                    </div>
                  </SelectItem>
                  <SelectItem value="pm2-error">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="h-3 w-3 text-red-400" />
                      PM2 stderr
                    </div>
                  </SelectItem>
                  <SelectItem value="file">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      Winston Log File
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File picker (only for winston file source) */}
            {logSource === "file" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">File</label>
                <Select
                  value={selectedFile}
                  onValueChange={setSelectedFile}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="Select log file" />
                  </SelectTrigger>
                  <SelectContent>
                    {logFiles.map((f) => (
                      <SelectItem key={f.name} value={f.name}>
                        <span className="font-mono text-xs">
                          {f.name}
                        </span>
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({f.sizeHuman})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Level filter (only for winston files) */}
            {logSource === "file" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Level</label>
                <Select
                  value={levelFilter}
                  onValueChange={setLevelFilter}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="WARN">Warn</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="ERROR,WARN">Error + Warn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Max lines */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Lines</label>
              <Select value={maxLines} onValueChange={setMaxLines}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                  <SelectItem value="2000">2000</SelectItem>
                  <SelectItem value="5000">5000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Search</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Filter logs by text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="font-mono text-xs"
                />
                <Button size="sm" variant="secondary" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <Button
              size="sm"
              onClick={fetchLogs}
              disabled={fetching}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${fetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto-refresh ON (5s)" : "Auto-refresh"}
            </Button>
            <Button
              size="sm"
              variant={autoScroll ? "default" : "outline"}
              onClick={() => setAutoScroll(!autoScroll)}
            >
              <ArrowDown className="h-3.5 w-3.5 mr-1" />
              Auto-scroll
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadLogs}
              disabled={!logData?.lines?.length}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>

            {/* Stats */}
            {logData && (
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {logData.returned.toLocaleString()} of{" "}
                  {logData.totalMatching.toLocaleString()} lines
                </span>
                {logData.truncated && (
                  <Badge variant="warning">Truncated</Badge>
                )}
                <Badge variant="neutral">{logData.file}</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log output */}
      <Card>
        <CardContent className="p-0">
          <div
            ref={logContainerRef}
            className="h-[calc(100vh-380px)] min-h-[400px] overflow-auto bg-neutral-950 rounded-lg p-3 space-y-0.5"
          >
            {fetching && !logData ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-6 w-6 animate-spin text-neutral-500" />
              </div>
            ) : logData?.lines?.length ? (
              logData.lines.map((line, i) => <LogLine key={i} line={line} />)
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
                No log entries found
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
