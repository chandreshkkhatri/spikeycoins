"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import EnhancedCard from "@/components/enhanced-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import api from "@/lib/api";
import { Copy, Plus, Trash2, Check, User, Mail, Calendar, Ticket } from "lucide-react";

interface Invite {
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch invites
  const fetchInvites = useCallback(async () => {
    if (!isLoggedIn) return;

    setLoadingInvites(true);
    setError(null);
    try {
      const response = await api.get("/invites");
      if (response.data.success) {
        setInvites(response.data.invites);
      }
    } catch (err: any) {
      let message = "An error occurred while loading invites.";

      if (err?.response) {
        const status = err.response.status;

        if (status === 401 || status === 403) {
          message = "You are not authorized to view invites. Please sign in again.";
        } else if (status >= 500) {
          message = "Our servers are having trouble loading invites. Please try again later.";
        } else if (err.response.data?.error) {
          message = err.response.data.error;
        }
      } else if (err?.request) {
        message = "Network error while loading invites. Please check your internet connection and try again.";
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }

      setError(message);
    } finally {
      setLoadingInvites(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchInvites();
    }
  }, [isLoggedIn, fetchInvites]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push("/login");
    }
  }, [authLoading, isLoggedIn, router]);

  // Create new invite
  const createInvite = async () => {
    setCreatingInvite(true);
    setError(null);
    try {
      const response = await api.post("/invites", { maxUses: 1 });
      if (response.data.success) {
        await fetchInvites();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create invite");
    } finally {
      setCreatingInvite(false);
    }
  };

  // Delete/deactivate invite
  const deleteInvite = async (code: string) => {
    try {
      await api.delete(`/invites/${code}`);
      await fetchInvites();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete invite");
    }
  };

  // Copy invite code
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (authLoading) {
    return <LoadingSpinner message="Loading settings..." />;
  }

  if (!isLoggedIn || !user) {
    return null;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and invites
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Section */}
        <EnhancedCard title="Profile">
          <div className="flex items-start gap-4">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{user.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </EnhancedCard>

        {/* Invites Section */}
        <EnhancedCard
          title="Invite Codes"
          action={
            <Button
              size="sm"
              onClick={createInvite}
              disabled={creatingInvite}
            >
              <Plus className="h-4 w-4 mr-1" />
              {creatingInvite ? "Creating..." : "New Invite"}
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground mb-4">
            Generate invite codes to share with others. Each code can be used once.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {loadingInvites ? (
            <div className="text-center py-4 text-muted-foreground">
              Loading invites...
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Ticket className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-4">
                You haven&apos;t created any invites yet
              </p>
              <Button onClick={createInvite} disabled={creatingInvite}>
                <Plus className="h-4 w-4 mr-1" />
                Create Your First Invite
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.code}
                  className={`flex items-center justify-between p-3 rounded-md border ${invite.isActive && invite.usedCount < invite.maxUses
                    ? "border-border bg-muted/30"
                    : "border-border/50 bg-muted/10 opacity-60"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <code className="font-mono text-sm bg-background px-2 py-1 rounded">
                      {invite.code}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {invite.usedCount}/{invite.maxUses} used
                    </span>
                    {!invite.isActive && (
                      <span className="text-xs text-destructive">Deactivated</span>
                    )}
                    {invite.usedCount >= invite.maxUses && invite.isActive && (
                      <span className="text-xs text-amber-600">Fully used</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyCode(invite.code)}
                      title="Copy code"
                    >
                      {copiedCode === invite.code ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    {invite.isActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteInvite(invite.code)}
                        title="Deactivate"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </EnhancedCard>
      </div>
    </div>
  );
}
