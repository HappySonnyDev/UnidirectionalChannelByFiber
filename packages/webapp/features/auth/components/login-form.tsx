"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/components/auth-context";
import { Fingerprint } from "lucide-react";

interface LoginFormProps {
  onSuccess?: () => void;
  onLoadingChange?: (loading: boolean) => void;
}

export function LoginForm({ onSuccess, onLoadingChange }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { login, register } = useAuth();

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/");
    }
  };

  const handlePasskeyAuth = async () => {
    setIsLoading(true);
    onLoadingChange?.(true);
    setError("");

    try {
      // Try login with existing Passkey first
      await login();
      handleSuccess();
    } catch (loginErr: any) {
      // If no existing credentials found, fall back to registration
      const errMsg = loginErr?.message || "";
      if (
        errMsg.includes("No credentials") ||
        errMsg.includes("not found") ||
        errMsg.includes("NotAllowedError") ||
        errMsg.includes("No matching") ||
        errMsg.includes("not configured")
      ) {
        try {
          await register();
          handleSuccess();
        } catch (registerErr: any) {
          setError(registerErr?.message || "Authentication failed");
        }
      } else {
        setError(errMsg || "Authentication failed");
      }
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={handlePasskeyAuth}
        disabled={isLoading}
        className="w-full"
        size="lg"
      >
        <Fingerprint className="mr-2 h-4 w-4" />
        {isLoading ? "Authenticating..." : "Sign In with Passkey"}
      </Button>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
