"use client";

import { useAuth } from "@/contexts/auth-context";
import { settingsService } from "@/lib/settings-service";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * OAuth callback page - handles token extraction from URL and redirects
 */
export default function AuthCallbackPage() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth context to process the tokens from URL
    if (isLoggedIn) {
      // Migrate local settings to server after successful login
      settingsService.migrateLocalSettingsToServer().then(() => {
        router.replace("/");
      });
    }
  }, [isLoggedIn, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
