import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/features/assistant/components/tooltip-icon-button";
import { ComposerAddAttachment, ComposerAttachments } from "@/features/assistant/components/attachment";
import { useAuth } from '@/features/auth/components/auth-context';
import { Coins, X, ArrowUpIcon, Square, Check, Loader2, Eye, AlertTriangle } from "lucide-react";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PaymentRecord, PaymentChannelInfo } from './payment-types';
import { PaymentStatusPanel } from './payment-status-panel';
import { TransactionDetailsModal } from './transaction-details-modal';
import {
  processInvoicePayment,
  hasInsufficientBalance,
  shannonToCkbDisplay,
  type ChunkPaymentEvent,
  type InvoiceFailedEvent,
} from '@/lib/client/chunk-payment-integration';
import {
  ComposerPrimitive,
  ThreadPrimitive,
  useComposerRuntime,
  useThreadRuntime,
} from '@assistant-ui/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChunkAwareComposerProps {
  onAuthRequired: () => void;
  onNewQuestion: () => string;
  onOpenSettings: (tab: 'recharge' | 'usage') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChunkAwareComposer: React.FC<ChunkAwareComposerProps> = ({
  onAuthRequired,
  onNewQuestion,
  onOpenSettings,
}) => {
  const { user, fiberNode } = useAuth();
  const composerRuntime = useComposerRuntime();
  const threadRuntime = useThreadRuntime();

  // Payment state
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);


  // Track active payments to avoid duplicates
  const payingChunks = useRef<Set<number>>(new Set());

  // Derive channel info from fiber node + payment records
  const paymentChannelInfo: PaymentChannelInfo = {
    availableBalance: fiberNode.availableBalance,
    activeChannelId: fiberNode.activeChannel?.channel_id ?? null,
    activeChannelBalance: fiberNode.activeChannelBalance,
    totalPaidShannon: String(
      paymentRecords
        .filter(r => r.status === 'confirmed')
        .reduce((sum, r) => sum + BigInt(r.amount || '0'), BigInt(0))
    ),
    confirmedCount: paymentRecords.filter(r => r.status === 'confirmed').length,
    failedCount: paymentRecords.filter(r => r.status === 'failed').length,
  };

  // Navigate to Usage tab in settings dialog
  const handleOpenUsage = useCallback(() => {
    onOpenSettings('usage');
  }, [onOpenSettings]);

  // -----------------------------------------------------------------------
  // Process an invoice-request event
  // -----------------------------------------------------------------------
  const handleInvoiceRequest = useCallback(async (
    eventData: ChunkPaymentEvent['data'],
  ) => {
    const { chunkIndex, amount, invoice, payment_hash } = eventData;

    // Avoid duplicate payments
    if (payingChunks.current.has(chunkIndex)) return;

    // Check balance
    if (hasInsufficientBalance(fiberNode.availableBalance, amount)) {
      setBalanceError(`Insufficient balance: ${fiberNode.availableBalance} available, need ${shannonToCkbDisplay(amount)}`);
      setPaymentRecords(prev =>
        prev.map(r =>
          r.payment_hash === payment_hash
            ? { ...r, status: 'failed' as const, error: 'Insufficient balance' }
            : r
        )
      );
      return;
    }

    setBalanceError(null);
    payingChunks.current.add(chunkIndex);

    // Mark as paying
    setPaymentRecords(prev =>
      prev.map(r =>
        r.payment_hash === payment_hash
          ? { ...r, status: 'paying' as const }
          : r
      )
    );

    try {
      const result = await processInvoicePayment(fiberNode, eventData);

      setPaymentRecords(prev =>
        prev.map(r =>
          r.payment_hash === payment_hash
            ? { ...r, status: result.status, error: result.error }
            : r
        )
      );

      if (result.status === 'confirmed') {
        console.log(`[Payment] Chunk #${chunkIndex} confirmed`);
      } else {
        console.warn(`[Payment] Chunk #${chunkIndex} failed:`, result.error);
      }
    } catch (err) {
      setPaymentRecords(prev =>
        prev.map(r =>
          r.payment_hash === payment_hash
            ? { ...r, status: 'failed' as const, error: err instanceof Error ? err.message : 'Unknown error' }
            : r
        )
      );
    } finally {
      payingChunks.current.delete(chunkIndex);
    }
  }, [fiberNode]);

  // -----------------------------------------------------------------------
  // Listen for invoice events from the SSE stream via CustomEvents
  // -----------------------------------------------------------------------
  useEffect(() => {
    // The assistant-ui runtime forwards 'data' type events as CustomEvents
    // on the window object. We listen for 'invoice-request' and 'invoice-failed'.
    const handleInvoiceRequestEvent = (event: CustomEvent) => {
      const { type, data } = event.detail;

      if (type === 'invoice-request') {
        const invoiceData = data as ChunkPaymentEvent['data'];

        // Create a payment record if it doesn't exist yet
        setPaymentRecords(prev => {
          if (prev.some(r => r.payment_hash === invoiceData.payment_hash)) return prev;
          return [
            ...prev,
            {
              chunkIndex: invoiceData.chunkIndex,
              invoice: invoiceData.invoice,
              payment_hash: invoiceData.payment_hash,
              amount: invoiceData.amount,
              status: 'pending' as const,
              timestamp: new Date().toISOString(),
            },
          ];
        });

        // Auto-pay invoice
        if (fiberNode.isNodeReady) {
          handleInvoiceRequest(invoiceData);
        }
      }

      if (type === 'invoice-failed') {
        const failedData = data as InvoiceFailedEvent['data'];
        console.warn(`[Payment] Invoice creation failed for chunk #${failedData.chunkIndex}:`, failedData.error);
      }
    };

    window.addEventListener('assistant-ui-data', handleInvoiceRequestEvent as EventListener);

    return () => {
      window.removeEventListener('assistant-ui-data', handleInvoiceRequestEvent as EventListener);
    };
  }, [fiberNode.isNodeReady, handleInvoiceRequest]);

  // -----------------------------------------------------------------------
  // Monitor streaming state
  // -----------------------------------------------------------------------
  useEffect(() => {
    const runtime = threadRuntime;
    if (runtime && runtime.subscribe) {
      return runtime.subscribe(() => {
        const state = runtime.getState();
        const isRunning = state.isRunning || false;
        setIsStreamingActive(isRunning);
      });
    }
  }, [threadRuntime]);

  // -----------------------------------------------------------------------
  // Manual retry for a failed payment
  //
  // Before retrying, we check the actual payment status on the Fiber node:
  //   - If the payment already succeeded (was marked "failed" prematurely),
  //     we just update local state without re-sending.
  //   - If the payment truly failed, we request a NEW invoice from the server
  //     (Fiber invoices cannot be reused — each invoice can only be paid once).
  // -----------------------------------------------------------------------
  const handleRetryPayment = useCallback(async (record: PaymentRecord) => {
    if (!fiberNode.isNodeReady) {
      alert('Fiber node not connected');
      return;
    }

    try {
      // 1. Check actual payment status on the Fiber node
      const paymentStatus = await fiberNode.getPayment(record.payment_hash);

      if (paymentStatus?.status === 'Success') {
        // Payment actually succeeded — it was marked "failed" prematurely.
        // Just update local state.
        setPaymentRecords(prev =>
          prev.map(r =>
            r.payment_hash === record.payment_hash
              ? { ...r, status: 'confirmed' as const, error: undefined }
              : r
          )
        );
        return;
      }

      // 2. Payment truly failed (or still in non-terminal state after timeout).
      //    Need to request a NEW invoice — Fiber invoices cannot be reused.
      const invoiceResponse = await fetch('/api/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: record.amount,
          description: `Retry for chunk #${record.chunkIndex}`,
        }),
      });

      const invoiceData = await invoiceResponse.json();

      if (!invoiceResponse.ok || !invoiceData.success) {
        const error = invoiceData.error || 'Failed to create new invoice';
        setPaymentRecords(prev =>
          prev.map(r =>
            r.payment_hash === record.payment_hash
              ? { ...r, error: `Retry failed: ${error}` }
              : r
          )
        );
        return;
      }

      // 3. Update the record with the new invoice data and pay it
      setPaymentRecords(prev =>
        prev.map(r =>
          r.payment_hash === record.payment_hash
            ? {
                ...r,
                invoice: invoiceData.invoice,
                payment_hash: invoiceData.payment_hash,
                status: 'pending' as const,
                error: undefined,
              }
            : r
        )
      );

      await handleInvoiceRequest({
        invoice: invoiceData.invoice,
        payment_hash: invoiceData.payment_hash,
        amount: record.amount,
        chunkIndex: record.chunkIndex,
      });
    } catch (err) {
      setPaymentRecords(prev =>
        prev.map(r =>
          r.payment_hash === record.payment_hash
            ? { ...r, error: `Retry error: ${err instanceof Error ? err.message : 'Unknown'}` }
            : r
        )
      );
    }
  }, [fiberNode.isNodeReady, fiberNode.getPayment, handleInvoiceRequest]);

  // -----------------------------------------------------------------------
  // Pre-send validation
  // -----------------------------------------------------------------------
  const handlePreSendValidation = useCallback(async () => {
    if (!user) {
      onAuthRequired();
      return false;
    }

    // Check that the Fiber node is connected
    if (!fiberNode.isNodeReady) {
      alert('Fiber node is not connected. Please connect first.');
      return false;
    }

    // Check if there are any failed payments that should be retried
    const failedPayments = paymentRecords.filter(r => r.status === 'failed');
    if (failedPayments.length > 0 && !showPaymentModal) {
      setSelectedRecord(failedPayments[0]);
      setShowPaymentModal(true);
      return false;
    }

    // Check 4: Channel balance check
    // Must have at least one CHANNEL_READY channel with available balance
    const hasReadyChannel = fiberNode.channels?.some(ch =>
      ch.state?.state_name?.toLowerCase().includes('ready')
    );
    const availableCkb = parseFloat(fiberNode.availableBalance);

    if (!hasReadyChannel || isNaN(availableCkb) || availableCkb <= 0) {
      onOpenSettings('recharge');
      return false;
    }

    const sessionId = onNewQuestion();
    console.log('[Composer] Pre-send validation passed - session:', sessionId);
    return true;
  }, [user, fiberNode.isNodeReady, fiberNode.channels, fiberNode.availableBalance, paymentRecords, showPaymentModal, onAuthRequired, onNewQuestion, onOpenSettings]);

  // -----------------------------------------------------------------------
  // Send handler
  // -----------------------------------------------------------------------
  const handleSend = useCallback(async () => {
    const isValid = await handlePreSendValidation();
    if (!isValid) return;

    setBalanceError(null);
    composerRuntime.send();
  }, [handlePreSendValidation, composerRuntime]);

  // -----------------------------------------------------------------------
  // Keyboard handler
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  }, [handleSend]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-2">
      {user && (
        <PaymentStatusPanel
          paymentChannelInfo={paymentChannelInfo}
          paymentRecords={paymentRecords}
          isStreamingActive={isStreamingActive}
          onRetryPayment={handleRetryPayment}
          onShowDetails={(record) => {
            setSelectedRecord(record);
            setShowPaymentModal(false);
          }}
          onOpenUsage={handleOpenUsage}
          balanceError={balanceError}
        />
      )}

      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col rounded-3xl border border-border bg-muted px-1 pt-2 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-muted-foreground/15">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="aui-composer-input mb-1 max-h-32 min-h-16 w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-base outline-none placeholder:text-muted-foreground focus:outline-primary"
          rows={1}
          autoFocus
          aria-label="Message input"
          onKeyDown={handleKeyDown}
        />

        <div className="aui-composer-action-wrapper relative mx-1 mt-2 mb-2 flex items-center justify-between">
          <ComposerAddAttachment />

          <ThreadPrimitive.If running={false}>
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-[34px] rounded-full p-1"
              aria-label="Send message"
              onClick={handleSend}
            >
              <ArrowUpIcon className="aui-composer-send-icon size-5" />
            </TooltipIconButton>
          </ThreadPrimitive.If>

          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel asChild>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="aui-composer-cancel size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
                aria-label="Stop generating"
              >
                <Square className="aui-composer-cancel-icon size-3.5 fill-white dark:fill-black" />
              </Button>
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>

      {selectedRecord && (
        <TransactionDetailsModal
          selectedRecord={selectedRecord}
          showPaymentModal={showPaymentModal}
          onClose={() => {
            setSelectedRecord(null);
            setShowPaymentModal(false);
          }}
          onRetry={() => {
            handleRetryPayment(selectedRecord);
            setSelectedRecord(null);
            setShowPaymentModal(false);
          }}
        />
      )}

    </div>
  );
};
