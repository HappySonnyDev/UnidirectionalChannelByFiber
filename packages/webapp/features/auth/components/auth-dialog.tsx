"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoginForm } from "./login-form";

interface AuthDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AuthDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AuthDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or internal open state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const handleSuccess = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome</DialogTitle>
        </DialogHeader>

        {/* Form Content */}
        <div className="mt-6 space-y-4">
          <LoginForm onSuccess={handleSuccess} />
        </div>

        {/* Info Message */}
        <div className="mt-4 text-center text-sm text-gray-600">
          <p className="mb-2">
            Sign in securely with Passkey — no passwords or private keys needed.
          </p>
          <p className="text-xs text-gray-500">
            Your Passkey is stored on your device and never sent to our servers.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
