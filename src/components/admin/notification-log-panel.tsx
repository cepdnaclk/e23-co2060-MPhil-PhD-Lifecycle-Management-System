"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type NotificationLogItem = {
  id: string;
  recipientId: string;
  recipientEmail: string | null;
  recipientName: string;
  event: string;
  subject: string;
  deliveryStatus: "SENT" | "FAILED";
  failureReason: string | null;
  createdAt: string | Date;
};

type NotificationLogPage = {
  logs?: NotificationLogItem[];
  total?: number;
  page?: number;
  pageCount?: number;
  error?: string;
};

type LogFilters = {
  recipientId: string;
  event: string;
  status: string;
  startDate: string;
  endDate: string;
};

const NOTIFICATION_EVENTS = [
  "APPLICATION_STATUS_CHANGED",
  "PROPOSAL_STATUS_CHANGED",
  "ETHICS_APPROVAL_SUBMITTED",
  "ETHICS_APPROVAL_STATUS_CHANGED",
  "PROGRESS_REPORT_SUBMITTED",
  "PROGRESS_REPORT_SIGNED_OFF",
  "THESIS_DOWNLOADED",
  "REGISTRATION_EXPIRY_APPROACHING",
  "VIVA_SCHEDULED",
  "CORRECTIONS_REQUIRED",
  "THESIS_ARCHIVED",
] as const;

const EMPTY_FILTERS: LogFilters = {
  recipientId: "",
  event: "",
  status: "",
  startDate: "",
  endDate: "",
};

function formatEventLabel(event: string) {
  return event
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildQueryString(filters: LogFilters, page: number, format?: "csv") {
  const params = new URLSearchParams({
    limit: "50",
    page: String(page),
  });

  if (filters.recipientId.trim()) params.set("recipientId", filters.recipientId.trim());
  if (filters.event) params.set("event", filters.event);
  if (filters.status) params.set("status", filters.status);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (format) params.set("format", format);

  return params.toString();
}

function getStatusBadge(log: NotificationLogItem) {
  if (log.deliveryStatus === "FAILED") {
    return <Badge variant="destructive">Failed</Badge>;
  }

  return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
      Sent
    </Badge>
  );
}

export function NotificationLogPanel() {
  const [draftFilters, setDraftFilters] = useState<LogFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<LogFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentPageStats = useMemo(() => {
    const failed = logs.filter((log) => log.deliveryStatus === "FAILED").length;

    return {
      failed,
      sent: logs.length - failed,
    };
  }, [logs]);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/notification-log?${buildQueryString(appliedFilters, page)}`,
        { credentials: "include" },
      );
      const payload = (await response.json()) as NotificationLogPage;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load notification logs.");
      }

      setLogs(payload.logs ?? []);
      setTotal(payload.total ?? 0);
      setPageCount(payload.pageCount ?? 0);
    } catch (error) {
      setLogs([]);
      setTotal(0);
      setPageCount(0);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notification logs.");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  }

  function resetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function exportCsv() {
    const queryString = buildQueryString(appliedFilters, page, "csv");
    window.open(
      `/api/admin/notification-log?${queryString}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const visiblePageCount = Math.max(pageCount, 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notification Log</h2>
          <p className="text-muted-foreground">
            Review immutable email and in-app notification delivery attempts.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total matching records</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent on this page</CardDescription>
            <CardTitle className="text-3xl">{currentPageStats.sent}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed on this page</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {currentPageStats.failed}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter by recipient, event, delivery status, or delivery date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="grid gap-4 lg:grid-cols-6">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="recipientId">Recipient ID</Label>
              <Input
                id="recipientId"
                placeholder="user-student-1"
                value={draftFilters.recipientId}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    recipientId: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Event</Label>
              <Select
                value={draftFilters.event || "ALL"}
                onValueChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    event: value === "ALL" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Any event</SelectItem>
                  {NOTIFICATION_EVENTS.map((event) => (
                    <SelectItem key={event} value={event}>
                      {formatEventLabel(event)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={draftFilters.status || "ALL"}
                onValueChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    status: value === "ALL" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Any status</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">From</Label>
              <Input
                id="startDate"
                type="date"
                value={draftFilters.startDate}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">To</Label>
              <Input
                id="endDate"
                type="date"
                value={draftFilters.endDate}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-2 lg:col-span-6">
              <Button type="submit">
                <Search className="mr-2 h-4 w-4" />
                Apply Filters
              </Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Delivery Attempts</CardTitle>
              <CardDescription>
                Read-only audit records sorted by newest delivery attempt.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Page {page} of {visiblePageCount}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous page</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= visiblePageCount || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Timestamp</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-6">Failure Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
                      <Loader />
                      <span>Loading notification logs...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No notification log entries match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="px-6 text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{log.recipientName}</div>
                      <div className="text-sm text-muted-foreground">
                        {log.recipientEmail ?? log.recipientId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatEventLabel(log.event)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[340px] whitespace-normal font-medium">
                      {log.subject}
                    </TableCell>
                    <TableCell>{getStatusBadge(log)}</TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal px-6 text-sm text-muted-foreground">
                      {log.failureReason ?? "None"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
