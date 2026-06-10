"use client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { ThreadWithCustomComposer } from "@/features/assistant/components/thread-with-custom-composer";
import { useAuth } from "@/features/auth/components/auth-context";
import { AuthDialog } from "@/features/auth/components/auth-dialog";
import { UserSettingsDialog } from "@/features/settings/components/user-settings-dialog";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserDropdown } from "@/components/shared/user-dropdown";
import { ThreadListSidebar } from "@/features/assistant/components/threadlist-sidebar";

export const Assistant = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [userSettingsTab, setUserSettingsTab] = useState<'profile' | 'usage' | 'billing' | 'recharge'>('profile');

  // Handle invoice payment data from streaming response
  const handleInvoiceData = async (dataPart: { type: `data-${string}`; id?: string; data: unknown }) => {
    // The chat route sends 'data-invoice-request' / 'data-invoice-failed' events
    const eventType = dataPart.type.slice(5); // Remove 'data-' prefix
    const data = dataPart.data as Record<string, unknown>;
    if (data && typeof data === 'object') {
      const event = new CustomEvent('assistant-ui-data', {
        detail: { type: eventType, data },
      });
      window.dispatchEvent(event);
    }
  };

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: () => {
        const address = typeof window !== 'undefined' 
          ? localStorage.getItem('dapp2-ckb-address') 
          : null;
        return address ? { 'X-CKB-Address': address } : {} as Record<string, string>;
      },
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        // Handle 402 Payment Required
        if (response.status === 402) {
          const data = await response.json();
          // Emit payment error event
          const paymentErrorEvent = new CustomEvent('paymentError', {
            detail: {
              error: data.error,
              remainingBalance: data.remainingBalance,
              channelId: data.channelId,
              timestamp: new Date().toISOString()
            }
          });
          window.dispatchEvent(paymentErrorEvent);
          // Open recharge dialog
          setUserSettingsTab('recharge');
          setShowUserSettings(true);
        }
        return response;
      }
    }),
    onData: handleInvoiceData
  });

  const handleAuthRequired = () => {
    setShowAuthDialog(true);
  };

  const handleUserMenuClick = (tab: 'profile' | 'usage' | 'billing' | 'recharge') => {
    setUserSettingsTab(tab);
    setShowUserSettings(true);
  };

  // Generate new session ID for each new question
  const generateNewSessionId = () => {
    // Session ID is now generated on the server side
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Submit pending message after authentication
  useEffect(() => {
    if (user && pendingMessage && !showAuthDialog) {
      if (pendingMessage.trim()) {
        // Use the thread runtime to directly append and send the pending message
        const threadRuntime = runtime.thread;
        threadRuntime.append({
          role: "user",
          content: [{ type: "text", text: pendingMessage.trim() }],
        });
        setPendingMessage(''); // Clear pending message immediately
      }
    }
  }, [user, pendingMessage, showAuthDialog, runtime]);

  return (
    <>
      <AssistantRuntimeProvider runtime={runtime}>
        <SidebarProvider>
          <div className="flex h-dvh w-full pr-0.5">
            <ThreadListSidebar />
            <SidebarInset>
              <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger />
                {/* Auth Section - Right side */}
                <div className="ml-auto">
                  {isAuthenticated ? (
                  // User is authenticated (Fiber node is ready) – show user dropdown or indicator
                  user ? (
                    <UserDropdown 
                      user={user}
                      onMenuClick={handleUserMenuClick}
                      onLogout={logout}
                    />
                  ) : (
                    // Authenticated but server sync pending – show minimal indicator
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="flex items-center space-x-2"
                      onClick={() => handleUserMenuClick('profile')}
                    >
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">✓</span>
                      </div>
                      <span className="text-sm">Connected</span>
                    </Button>
                  )
                ) : (
                  // User not authenticated – show login button
                  <Button 
                    onClick={() => {
                      setShowAuthDialog(true);
                    }}
                    size="sm"
                  >
                    Sign in
                  </Button>
                )}
              </div>
            </header>
            <div className="flex-1 overflow-hidden relative">
              <ThreadWithCustomComposer
                onAuthRequired={handleAuthRequired}
                pendingMessage={pendingMessage}
                setPendingMessage={setPendingMessage}
                onNewQuestion={generateNewSessionId}
                onOpenSettings={handleUserMenuClick}
              />
            </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </AssistantRuntimeProvider>

      {/* Auth Dialog */}
      <AuthDialog 
        open={showAuthDialog} 
        onOpenChange={setShowAuthDialog}
      />
      
      {/* User Settings Dialog */}
      <UserSettingsDialog
        open={showUserSettings}
        onOpenChange={setShowUserSettings}
        defaultTab={userSettingsTab}
      />
    </>
  );
};
