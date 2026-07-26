"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader } from "@/components/ui/loader";
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
import { secureFetch } from "@/lib/security/client-request";

type OutboxItem = {
  id: string;
  eventKey: string;
  topic: string;
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  recipient: { displayName: string; email: string } | null;
  createdAt: string;
};

const FILTERS = [
  "ALL",
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "FAILED",
  "DEAD_LETTER",
] as const;

export function OutboxRecoveryPanel() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("ALL");
  const [messages, setMessages] = useState<OutboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const query = status === "ALL" ? "" : `?status=${status}`;
      const response = await fetch(`/api/admin/outbox${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        messages?: OutboxItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load queued notifications.");
      }

      setMessages(payload.messages ?? []);
    } catch (loadError) {
      setMessages([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load queued notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(id: string) {
    setRetryingId(id);
    setError(null);

    try {
      const response = await secureFetch(`/api/admin/outbox/${id}/retry`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to retry this notification.");
      }

      await load();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "Unable to retry this notification.",
      );
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Notification Recovery
          </h2>
          <p className="text-muted-foreground">
            Inspect queued lifecycle notifications and requeue failed delivery.
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(value as (typeof FILTERS)[number])
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((filter) => (
                <SelectItem value={filter} key={filter}>
                  {filter.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transactional outbox</CardTitle>
          <CardDescription>
            Delivery attempts are retried automatically. Dead-letter records
            require an administrator to requeue them after resolving the cause.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Created</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Event key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="px-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    <Loader />
                  </TableCell>
                </TableRow>
              ) : messages.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No queued notifications match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                messages.map((item) => {
                  const canRetry =
                    item.status === "FAILED" || item.status === "DEAD_LETTER";

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="px-6">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {item.recipient?.displayName ?? "System event"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.recipient?.email ?? "No direct recipient"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64 break-all font-mono text-xs">
                        {item.eventKey}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "FAILED" ||
                            item.status === "DEAD_LETTER"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {item.status.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.attempts}/{item.maxAttempts}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal text-sm text-muted-foreground">
                        {item.lastError ?? "None"}
                      </TableCell>
                      <TableCell className="px-6 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canRetry || retryingId === item.id}
                          onClick={() => void retry(item.id)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Requeue
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
