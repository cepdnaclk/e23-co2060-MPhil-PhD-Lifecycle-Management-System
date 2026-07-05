"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

type DashboardNotification = {
  id: string;
  event: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string | Date;
};

type NotificationsResponse = {
  notifications?: DashboardNotification[];
  unreadCount?: number;
  error?: string;
};

function formatNotificationDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getEventLabel(event: string) {
  return event.replaceAll("_", " ").toLowerCase();
}

export function DashboardNotificationsMenu({ trigger }: { trigger?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const visibleUnreadCount = useMemo(
    () => unreadCount || notifications.filter((notification) => !notification.isRead).length,
    [notifications, unreadCount],
  );

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications?limit=8", {
        credentials: "include",
      });
      const payload = (await response.json()) as NotificationsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load notifications.");
      }

      const nextNotifications = payload.notifications ?? [];

      setNotifications(nextNotifications);
      setUnreadCount(
        payload.unreadCount ??
          nextNotifications.filter((notification) => !notification.isRead).length,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load notifications.");
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAllRead() {
    setIsMarkingRead(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to mark notifications as read.");
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          isRead: true,
        })),
      );
      setUnreadCount(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update notifications.");
    } finally {
      setIsMarkingRead(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" className="relative" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {visibleUnreadCount > 0 && (
              <Badge variant="destructive" className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full p-0">
                {visibleUnreadCount}
              </Badge>
            )}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div className="space-y-1">
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Recent alerts and workflow updates</SheetDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAllRead()}
            disabled={visibleUnreadCount === 0 || isMarkingRead}
          >
            {isMarkingRead ? "Saving..." : "Mark all read"}
          </Button>
        </SheetHeader>

        {error ? (
          <div className="mt-4 rounded-md bg-destructive/15 p-3 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bell className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="mt-4 text-sm font-medium">No notifications yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Workflow alerts will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="mt-4 h-full pr-4">
            <div className="flex flex-col gap-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`flex flex-col gap-2 p-4 transition-colors ${
                    notification.isRead ? "bg-muted/40" : "bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {!notification.isRead && (
                      <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="font-normal">
                          {getEventLabel(notification.event)}
                        </Badge>
                        <span>{formatNotificationDate(notification.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
