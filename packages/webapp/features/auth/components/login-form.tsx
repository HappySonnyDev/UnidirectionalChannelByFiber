"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/components/auth-context";
import { Fingerprint, UserPlus } from "lucide-react";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { login, register } = useAuth();

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");

    try {
      await login();
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    setIsLoading(true);
    setError("");

    try {
      await register();
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Button
          onClick={handleRegister}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {isLoading ? "Creating account..." : "Create New Account"}
        </Button>

        <Button
          onClick={handleLogin}
          disabled={isLoading}
          variant="outline"
          className="w-full"
          size="lg"
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          {isLoading ? "Authenticating..." : "Already have an account, Sign In"}
        </Button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
