/**
 * Fiber Network Configuration
 * 
 * Configuration for connecting to the merchant's Fiber node.
 * In production, these values should come from environment variables.
 */

export const FIBER_CONFIG = {
  // Merchant node RPC endpoint (for server-side invoice creation)
  MERCHANT_NODE_RPC: process.env.FIBER_MERCHANT_RPC || 'http://127.0.0.1:8227',

  // Merchant node public key (hex string with 0x prefix)
  // This is used by the browser WASM node to connect and open channels.
  // NOTE: Must use NEXT_PUBLIC_ prefix so Next.js inlines it into the client bundle.
  MERCHANT_PUBKEY:
    process.env.NEXT_PUBLIC_FIBER_MERCHANT_PUBKEY ||
    process.env.FIBER_MERCHANT_PUBKEY ||
    '0x' + '0'.repeat(66),

  // Merchant node multiaddr for WebSocket P2P connection
  // Format: /ip4/<IP>/tcp/<PORT>/ws
  MERCHANT_MULTIADDR:
    process.env.NEXT_PUBLIC_FIBER_MERCHANT_MULTIADDR ||
    process.env.FIBER_MERCHANT_MULTIADDR ||
    '/ip4/127.0.0.1/tcp/8228/ws',

  // Network configuration (also used in client components)
  NETWORK: (process.env.NEXT_PUBLIC_FIBER_NETWORK ||
    process.env.FIBER_NETWORK ||
    'testnet') as 'testnet' | 'mainnet' | 'devnet',
  
  // Invoice currency based on network
  get INVOICE_CURRENCY() {
    switch (this.NETWORK) {
      case 'mainnet': return 'Fibb';
      case 'testnet': return 'Fibt';
      case 'devnet': return 'Fibd';
    }
  },
  
  // Payment configuration
  PAYMENT: {
    // Cost per AI response chunk in CKB (shannon)
    CHUNK_PRICE_SHANNON: BigInt(50_000_000), // 0.5 CKB per chunk
    
    // Invoice expiry in seconds
    INVOICE_EXPIRY: 3600, // 1 hour
  },
} as const;
