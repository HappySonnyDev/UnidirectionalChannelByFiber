'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FiberBrowserNode,
  PasskeyCredentialProvider,
  scriptToAddress,
  type BrowserNodeState,
  type NodeInfoResult,
  type ListChannelsResult,
  type GetPaymentParams,
  type GetPaymentResult,
  type PaymentHash,
} from '@fiber-pay/sdk/browser';
import { addressToScript } from '@nervosnetwork/ckb-sdk-utils';
import { FIBER_CONFIG } from '@/lib/config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSKEY_IDENTIFIER = 'dapp-2-fiber-ai';

/** 99 CKB in shannon – each channel reserves this amount (not spendable) */
const CHANNEL_RESERVE = FIBER_CONFIG.PAYMENT.CHANNEL_RESERVE_SHANNON; // 9_900_000_000

/** CKB RPC endpoints for on-chain balance queries */
const CKB_RPC_ENDPOINTS: Record<string, string> = {
  testnet: 'https://testnet.ckbapp.dev/',
  mainnet: 'https://mainnet.ckbapp.dev/',
  devnet: 'http://127.0.0.1:8114/',
};

/** localStorage key for persisting connection state */
const STORAGE_KEY_CONNECTED = 'dapp2-fiber-connected';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function queryCkbBalance(
  address: string,
  network: string,
): Promise<bigint> {
  const rpcUrl = CKB_RPC_ENDPOINTS[network] || CKB_RPC_ENDPOINTS.testnet;
  try {
    const script = addressToScript(address);
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'get_cells_capacity',
        params: [
          {
            script: {
              code_hash: script.codeHash,
              hash_type: script.hashType,
              args: script.args,
            },
            script_type: 'lock',
          },
        ],
        id: 1,
      }),
    });
    const data = await response.json();
    if (data.result) {
      return BigInt(data.result.capacity);
    }
    return BigInt(0);
  } catch (err) {
    console.error('[useFiberNode] Failed to query CKB balance:', err);
    return BigInt(0);
  }
}

/** Convert shannon bigint to human-readable CKB string */
function shannonToCkb(shannon: bigint): string {
  const ckb = Number(shannon) / 100_000_000;
  return `${ckb.toFixed(6)} CKB`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FiberNetwork = 'testnet' | 'mainnet';

export interface UseFiberNodeOptions {
  /** Merchant node secp256k1 public key (hex with 0x prefix) */
  merchantPubkey: string;
  /** Merchant node multiaddr, e.g. '/ip4/127.0.0.1/tcp/8228/ws' */
  merchantMultiaddr: string;
  /** Fiber network – defaults to value from config */
  network?: 'testnet' | 'mainnet' | 'devnet';
  /** Automatically reconnect if previously connected (default: true) */
  autoConnect?: boolean;
}

export interface UseFiberNodeResult {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isNodeReady: boolean;
  error: string | null;

  // Node info
  nodeInfo: NodeInfoResult | null;
  ckbAddress: string | null;
  onChainBalance: string;

  // Channel info
  channels: ListChannelsResult['channels'];
  availableBalance: string;

  // Operations
  connect: (passkeyDisplayName?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  openChannel: (fundingAmount: string) => Promise<any>;
  closeChannel: (channelId: string) => Promise<void>;
  sendPayment: (invoice: string) => Promise<any>;
  getPayment: (paymentHash: string) => Promise<GetPaymentResult>;
  waitForPayment: (paymentHash: string, options?: { timeout?: number; interval?: number }) => Promise<GetPaymentResult>;
  refreshChannels: () => Promise<void>;

  // Low-level ref for advanced usage
  browserNodeRef: React.MutableRefObject<FiberBrowserNode | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFiberNode({
  merchantPubkey,
  merchantMultiaddr,
  network = FIBER_CONFIG.NETWORK,
  autoConnect = true,
}: UseFiberNodeOptions): UseFiberNodeResult {
  /** Fiber network for SDK calls (devnet maps to testnet at SDK level) */
  const sdkNetwork: FiberNetwork = network === 'devnet' ? 'testnet' : (network as FiberNetwork);

  // -- State ----------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isNodeReady, setIsNodeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nodeInfo, setNodeInfo] = useState<NodeInfoResult | null>(null);
  const [ckbAddress, setCkbAddress] = useState<string | null>(null);
  const [onChainBalance, setOnChainBalance] = useState('0');

  const [channels, setChannels] = useState<ListChannelsResult['channels']>([]);
  const [availableBalance, setAvailableBalance] = useState('0');

  // -- Refs -----------------------------------------------------------------
  const browserNodeRef = useRef<FiberBrowserNode | null>(null);
  /** Guard against multiple concurrent connect / disconnect calls */
  const connectLockRef = useRef(false);

  // -- Balance calculation --------------------------------------------------
  const calculateAvailableBalance = useCallback(
    (chs: ListChannelsResult['channels']) => {
      // SDK can return 'CHANNEL_READY' or 'ChannelReady' depending on version
      const readyChannels = chs.filter((ch: ListChannelsResult['channels'][number]) =>
        ch.state.state_name.toLowerCase().includes('ready'),
      );

      const totalShannon = readyChannels.reduce((sum: bigint, ch: ListChannelsResult['channels'][number]) => {
        const local = BigInt(ch.local_balance);
        const offered = BigInt(ch.offered_tlc_balance || '0');
        const available = local - offered - CHANNEL_RESERVE;
        return sum + (available > BigInt(0) ? available : BigInt(0));
      }, BigInt(0));

      setAvailableBalance(shannonToCkb(totalShannon));
    },
    [],
  );

  // -- Refresh (node info + channels + on-chain balance) --------------------
  const refreshChannels = useCallback(async () => {
    const node = browserNodeRef.current;
    if (!node) return;

    try {
      const [info, chResult] = await Promise.all([
        node.getNodeInfo(),
        node.listChannels(),
      ]);

      setNodeInfo(info);
      setChannels(chResult.channels);
      calculateAvailableBalance(chResult.channels);

      // Derive CKB address from default funding lock script
      if (info.default_funding_lock_script) {
        try {
          const address = scriptToAddress(
            info.default_funding_lock_script,
            sdkNetwork === 'mainnet' ? 'mainnet' : 'testnet',
          );
          setCkbAddress(address);

          const capacity = await queryCkbBalance(address, sdkNetwork);
          setOnChainBalance(shannonToCkb(capacity));
        } catch (err) {
          console.error('[useFiberNode] scriptToAddress / balance failed:', err);
        }
      }

      setIsNodeReady(true);
    } catch (err) {
      console.error('[useFiberNode] refresh failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh node data');
    }
  }, [calculateAvailableBalance, sdkNetwork]);

  // -- Connect --------------------------------------------------------------
  const connect = useCallback(
    async (passkeyDisplayName = 'DApp2 Fiber User') => {
      if (connectLockRef.current || isConnected) return;
      connectLockRef.current = true;

      setIsConnecting(true);
      setError(null);

      try {
        // 1. SharedArrayBuffer check (required by WASM)
        if (typeof SharedArrayBuffer === 'undefined') {
          throw new Error(
            'SharedArrayBuffer is not available. Please ensure COOP/COEP headers are set correctly.',
          );
        }

        // 2. Passkey credential
        const credentialProvider = new PasskeyCredentialProvider(PASSKEY_IDENTIFIER);
        if (!credentialProvider.isConfigured()) {
          await credentialProvider.register(passkeyDisplayName);
        }

        // 3. Create browser node (no bootnodes – direct merchant connection)
        const node = new FiberBrowserNode({
          network: sdkNetwork,
          credential: credentialProvider,
          nodeConfig: { bootnodes: [] },
        });

        node.on('stateChange', (state: BrowserNodeState) => {
          if (state === 'running') setIsNodeReady(true);
          else if (state === 'idle' || state === 'stopped') setIsNodeReady(false);
        });

        node.on('error', (err: Error) => {
          setError(err.message);
        });

        browserNodeRef.current = node;

        // 4. Start node
        await node.start();

        // 5. Connect to merchant peer (direct, no router)
        try {
          await node.connectPeer({
            address: merchantMultiaddr,
            pubkey: merchantPubkey as `0x${string}`,
          });
        } catch (peerErr) {
          console.warn('[useFiberNode] Peer connection failed (will retry on openChannel):', peerErr);
          // Don't throw – channel opening will also trigger peer connection
        }

        setIsConnected(true);
        localStorage.setItem(STORAGE_KEY_CONNECTED, 'true');

        // 6. Initial data fetch
        await refreshChannels();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        setIsConnected(false);
        setIsNodeReady(false);
      } finally {
        setIsConnecting(false);
        connectLockRef.current = false;
      }
    },
    [isConnected, merchantMultiaddr, merchantPubkey, network, refreshChannels],
  );

  // -- Disconnect -----------------------------------------------------------
  const disconnect = useCallback(async () => {
    if (browserNodeRef.current) {
      try {
        browserNodeRef.current.stop();
      } catch {
        // best-effort
      }
      browserNodeRef.current = null;
    }

    setIsConnected(false);
    setIsNodeReady(false);
    setNodeInfo(null);
    setCkbAddress(null);
    setOnChainBalance('0');
    setChannels([]);
    setAvailableBalance('0');
    setError(null);

    localStorage.removeItem(STORAGE_KEY_CONNECTED);
  }, []);

  // -- Open channel ---------------------------------------------------------
  const openChannel = useCallback(
    async (fundingAmount: string) => {
      const node = browserNodeRef.current;
      if (!node) throw new Error('Node not connected');

      // Ensure peer is connected before opening channel
      try {
        const peerResult = await node.listPeers();
        const isPeerConnected = peerResult.peers.some(
          (p: { pubkey: string }) => p.pubkey.replace(/^0x/i, '').toLowerCase()
            === merchantPubkey.replace(/^0x/i, '').toLowerCase(),
        );
        if (!isPeerConnected) {
          await node.connectPeer({
            address: merchantMultiaddr,
            pubkey: merchantPubkey as `0x${string}`,
          });
        }
      } catch (peerErr) {
        console.warn('[useFiberNode] Peer reconnect attempt:', peerErr);
      }

      const result = await node.openChannel({
        pubkey: merchantPubkey as `0x${string}`,
        funding_amount: fundingAmount as `0x${string}`,
        public: false, // One-way channels cannot be public
        one_way: true, // Key: one-way payment channel
      });

      // Refresh channel list after opening
      await refreshChannels();

      return result;
    },
    [merchantPubkey, merchantMultiaddr, refreshChannels],
  );

  // -- Close channel --------------------------------------------------------
  const closeChannel = useCallback(
    async (channelId: string) => {
      const node = browserNodeRef.current;
      if (!node) throw new Error('Node not connected');

      await node.shutdownChannel({
        channel_id: channelId as `0x${string}`,
      });

      await refreshChannels();
    },
    [refreshChannels],
  );

  // -- Send payment ---------------------------------------------------------
  const sendPayment = useCallback(
    async (invoice: string) => {
      const node = browserNodeRef.current;
      if (!node) throw new Error('Node not connected');

      const payResult = await node.sendPayment({ invoice });
      // Refresh balances after payment
      await refreshChannels();
      return payResult;
    },
    [refreshChannels],
  );

  // -- Get payment status ---------------------------------------------------
  const getPayment = useCallback(
    async (paymentHash: string) => {
      const node = browserNodeRef.current;
      if (!node) throw new Error('Node not connected');

      return await node.getPayment({ payment_hash: paymentHash as PaymentHash });
    },
    [],
  );

  // -- Wait for payment to reach terminal state -----------------------------
  const waitForPayment = useCallback(
    async (paymentHash: string, options?: { timeout?: number; interval?: number }) => {
      const node = browserNodeRef.current;
      if (!node) throw new Error('Node not connected');

      return await node.waitForPayment(paymentHash as PaymentHash, {
        timeout: options?.timeout ?? 30_000,   // 30 seconds default
        interval: options?.interval ?? 2_000,  // 2 seconds default
      });
    },
    [],
  );

  // -- Auto-reconnect on mount ----------------------------------------------
  useEffect(() => {
    if (!autoConnect) return;

    const wasConnected = localStorage.getItem(STORAGE_KEY_CONNECTED) === 'true';
    if (wasConnected && !isConnected && !isConnecting) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  // -- Cleanup on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      if (browserNodeRef.current) {
        try {
          browserNodeRef.current.stop();
        } catch {
          // best-effort
        }
        browserNodeRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isNodeReady,
    error,
    nodeInfo,
    ckbAddress,
    onChainBalance,
    channels,
    availableBalance,
    connect,
    disconnect,
    openChannel,
    closeChannel,
    sendPayment,
    getPayment,
    waitForPayment,
    refreshChannels,
    browserNodeRef,
  };
}
