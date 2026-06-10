"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * Payment Channel Management (Admin)
 *
 * Channel management is now handled through the merchant node directly.
 * This component serves as a placeholder indicating that channel operations
 * should be performed via the merchant node CLI or RPC.
 */
export const PaymentChannelManagement: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-12 dark:border-slate-700 dark:bg-slate-800">
      <AlertCircle className="mb-4 h-10 w-10 text-slate-400" />
      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Channel Management Migrated
      </h3>
      <p className="max-w-md text-center text-sm text-slate-600 dark:text-slate-400">
        Payment channel management has been migrated to the merchant node. Please use the merchant node CLI or RPC interface for channel operations.
      </p>
    </div>
  );
};
