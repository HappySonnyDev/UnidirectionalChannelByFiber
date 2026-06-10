/**
 * usePaymentChannels hook (deprecated)
 *
 * Server-side channel listing API has been removed.
 * Channel data is now provided directly by the WASM Fiber node via useFiberNode().
 * This hook is kept as a no-op stub to avoid breaking imports.
 */

export interface PaymentChannel {
  id: number;
  channelId: string;
  userAddress: string;
  fundingAmount: string;
  status: string;
  statusText: string;
  createdAt: string;
  closedAt: string | null;
}

export const usePaymentChannels = () => {
  return {
    channels: [] as PaymentChannel[],
    activeChannels: [] as PaymentChannel[],
    defaultChannel: undefined as PaymentChannel | undefined,
    isLoading: false,
    error: null as string | null,
    refetch: async () => {},
  };
};
