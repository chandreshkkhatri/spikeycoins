import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import notificationService from "@/lib/notification-service";

export default function NotificationToggle() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check initial state
  useEffect(() => {
    const checkState = async () => {
      setIsSupported(notificationService.isPushSupported());
      setPermission(notificationService.getNotificationPermission());
      
      if (notificationService.isPushSupported()) {
        const subscribed = await notificationService.isSubscribedToPush();
        setIsSubscribed(subscribed);
      }
    };

    checkState();
  }, []);

  const handleToggle = useCallback(async () => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      if (isSubscribed) {
        // Unsubscribe
        const success = await notificationService.unsubscribeFromPushNotifications();
        if (success) {
          setIsSubscribed(false);
        }
      } else {
        // Subscribe
        const success = await notificationService.subscribeToPushNotifications();
        if (success) {
          setIsSubscribed(true);
          setPermission("granted");
          
          // Send a test notification to confirm it's working
          setTimeout(() => {
            notificationService.sendTestNotification().catch(console.error);
          }, 1000);
        } else {
          // Check if permission was denied
          setPermission(notificationService.getNotificationPermission());
        }
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isSubscribed]);

  // Don't render if not supported
  if (!isSupported) {
    return null;
  }

  let icon = <Bell className="h-5 w-5" />;
  let tooltipText = "Enable notifications";
  let variant: "ghost" | "default" | "outline" = "ghost";

  if (permission === "denied") {
    icon = <BellOff className="h-5 w-5 text-muted-foreground" />;
    tooltipText = "Notifications blocked. Please enable in browser settings.";
    variant = "ghost";
  } else if (isSubscribed) {
    icon = <BellRing className="h-5 w-5 text-green-500" />;
    tooltipText = "Notifications enabled. Click to disable.";
    variant = "ghost";
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size="icon"
            onClick={handleToggle}
            disabled={isLoading || permission === "denied"}
            className="relative"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              icon
            )}
            {isSubscribed && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
