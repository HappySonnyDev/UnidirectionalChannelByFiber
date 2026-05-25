import {
  streamText,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse
} from "ai";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { ChunkPaymentRepository, PaymentChannelRepository } from "@/lib/server/database";
import { getOrCreateTracker, generateChunkId, countTokens } from "@/lib/client/token-tracker";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent, ProxyAgent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

// Configure global proxy for all fetch requests (Node.js uses undici internally)
// Only use http/https proxy URLs (undici doesn't support socks)
const proxyUrl = [process.env.HTTPS_PROXY, process.env.https_proxy, process.env.HTTP_PROXY, process.env.http_proxy]
  .find(url => url && (url.startsWith('http://') || url.startsWith('https://')));

if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log('[Proxy] Configured proxy:', proxyUrl);
}

// Direct (non-proxy) dispatcher dedicated to local Ollama calls.
// Without this, undici's global ProxyAgent would also forward localhost:11434
// through the HTTP proxy (e.g. 127.0.0.1:1087), causing "other side closed".
// NOTE: must use undici's fetch directly. Next.js wraps the global fetch with
// instrumentation that breaks when a custom `dispatcher` is passed through
// ("invalid onRequestStart method").
const ollamaDispatcher = new Agent();
const ollamaFetch: typeof fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init ?? {}), dispatcher: ollamaDispatcher } as Parameters<typeof undiciFetch>[1])) as unknown as typeof fetch;

// Initialize Local Ollama provider (OpenAI-compatible API)
// Use 127.0.0.1 instead of localhost to avoid any DNS/proxy rule mismatch.
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
  apiKey: "ollama", // Ollama doesn't require an API key but the SDK expects one
  fetch: ollamaFetch,
});

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(req);
    const userId = user.id;

    const { messages }: { messages: UIMessage[] } = await req.json();

    // Always generate a new session ID for each API call (each question)
    const currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize token tracker for this session
    const tokenTracker = getOrCreateTracker(userId, currentSessionId);
    const chunkRepo = new ChunkPaymentRepository();
    const channelRepo = new PaymentChannelRepository();
    
    // Get user's default payment channel for calculations
    const defaultChannel = channelRepo.getUserDefaultChannel(userId);
    
    if (!defaultChannel) {
      return new Response(
        JSON.stringify({ error: "Payment Required: No active payment channel found. Please activate a payment channel first." }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    
    // Get existing cumulative tokens for this channel to avoid race conditions
    const existingCumulativeTokens = chunkRepo.getChannelCumulativeTokensWithCurrent(defaultChannel.channel_id, 0);
    let sessionCumulativeTokens = 0; // Track tokens added in this session

    // Check if channel has remaining balance before starting stream
    const existingCumulativePaymentCKB = existingCumulativeTokens * 100;
    const existingRemainingBalance = defaultChannel.amount - existingCumulativePaymentCKB;
    if (existingRemainingBalance <= 0) {
      return new Response(
        JSON.stringify({
          error: "Payment Required: Insufficient channel balance",
          remainingBalance: existingRemainingBalance,
          channelId: defaultChannel.channel_id
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Flag to track if balance exhausted during streaming
    let balanceExhausted = false;

    console.log('Streaming started for session:', currentSessionId, 'User:', userId);
    console.log('Channel existing cumulative tokens:', existingCumulativeTokens);
    
    // Create a UIMessageStream to include chunk payment data
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: ollama(process.env.OLLAMA_MODEL || "qwen2.5:0.5b"),
          messages: convertToModelMessages(messages),
          onChunk: ({ chunk }) => {
            // Skip processing if balance already exhausted
            if (balanceExhausted) return;

            // Track tokens for each chunk in real-time
            if (chunk.type === 'text-delta' && chunk.text) {
              const chunkId = generateChunkId();
              const tokens = tokenTracker.addChunk(chunkId, chunk.text);
              
              // Check if user will have enough balance after cumulative payment
              // Use session-level tracking to avoid database race conditions
              const potentialSessionTokens = sessionCumulativeTokens + tokens;
              const totalCumulativeTokens = existingCumulativeTokens + potentialSessionTokens;
              // Convert tokens to CKB for balance check: 1 Token = 100 CKB (since 1 CKB = 0.01 Token)
              const totalCumulativePaymentCKB = totalCumulativeTokens * 100;
              const potentialRemainingBalance = defaultChannel.amount - totalCumulativePaymentCKB;
              
              if (potentialRemainingBalance < 0) {
                console.warn(`Insufficient balance: cumulative payment would be ${totalCumulativePaymentCKB} CKB for ${totalCumulativeTokens} tokens, channel only has ${defaultChannel.amount} CKB`);
                // Mark balance as exhausted to skip further processing
                balanceExhausted = true;
                // Send error notification to client
                writer.write({
                  type: 'data-payment-error' as const,
                  data: {
                    error: "Payment Required: Insufficient channel balance",
                    remainingBalance: potentialRemainingBalance,
                    cumulativePayment: totalCumulativePaymentCKB,
                    channelId: defaultChannel.channel_id
                  },
                  transient: true
                });
                // Still create the chunk but mark as unpaid for payment tracking
                try {
                  chunkRepo.createChunkPayment({
                    chunk_id: chunkId,
                    user_id: userId,
                    session_id: currentSessionId,
                    channel_id: defaultChannel.channel_id,
                    tokens_count: tokens,
                    is_paid: false,
                    cumulative_payment: totalCumulativePaymentCKB,
                    remaining_balance: potentialRemainingBalance
                  });
                } catch (error) {
                  console.warn('Failed to store unpaid chunk payment:', error);
                }
                return; // Skip further processing for this chunk
              }
              
              // Two-stage approach: Create unpaid chunk first, payment updates consumed tokens later
              try {
                // Increment session token counter for this chunk
                sessionCumulativeTokens += tokens;
                
                // Calculate cumulative payment using session tracking to avoid race conditions
                // This represents what the user should pay in total for all chunks in this channel
                const cumulativeTokens = existingCumulativeTokens + sessionCumulativeTokens;
                // Convert tokens to CKB for payment: 1 Token = 100 CKB (since 1 CKB = 0.01 Token)
                const cumulativePayment = cumulativeTokens * 100; // Convert tokens to CKB
                const remainingBalance = defaultChannel.amount - cumulativePayment;
                
                console.log(`📊 Payment Channel ${defaultChannel.channel_id} - Chunk ${chunkId}:`);
                console.log(`  - This chunk tokens: ${tokens}`);
                console.log(`  - Session tokens so far: ${sessionCumulativeTokens}`);
                console.log(`  - Existing channel tokens: ${existingCumulativeTokens}`);
                console.log(`  - Total cumulative tokens: ${cumulativeTokens}`);
                console.log(`  - Cumulative payment (CKB): ${cumulativePayment}`);
                console.log(`  - Remaining balance (CKB): ${remainingBalance}`);
                console.log(`Payment Channel ${defaultChannel.channel_id}: Cumulative payment will be ${cumulativePayment}/${defaultChannel.amount} CKB (${remainingBalance} CKB remaining)`);

                // Create chunk record as UNPAID - payment is separate from consumption tracking
                chunkRepo.createChunkPayment({
                  chunk_id: chunkId,
                  user_id: userId,
                  session_id: currentSessionId,
                  channel_id: defaultChannel.channel_id,
                  tokens_count: tokens,
                  is_paid: false, // Always create as unpaid for payment tracking
                  cumulative_payment: cumulativePayment, // Store cumulative payment amount
                  remaining_balance: remainingBalance // Store remaining balance
                });
                
                // Update channel consumed tokens immediately during streaming
                // This tracks actual consumption regardless of payment status
                const channelRepo = new PaymentChannelRepository();
                const updateStmt = channelRepo['db'].prepare(`
                  UPDATE payment_channels 
                  SET consumed_tokens = consumed_tokens + ?, updated_at = CURRENT_TIMESTAMP 
                  WHERE channel_id = ?
                `);
                updateStmt.run(tokens, defaultChannel.channel_id);
                
                console.log(`✅ Chunk created for payment tracking: ${tokens} tokens for chunk: ${chunkId} (isPaid: false)`);
                
                // Send chunk payment data to the client with cumulative payment info
                writer.write({
                  type: 'data-chunk-payment' as const,
                  data: {
                    chunkId,
                    tokens,
                    sessionId: currentSessionId,
                    isPaid: false, // Chunk is unpaid - requires separate payment verification
                    cumulativePayment: cumulativePayment, // Total amount user should pay for all chunks in channel
                    remainingBalance: remainingBalance, // Amount user will receive back from channel
                    channelId: defaultChannel.channel_id,
                    channelTotalAmount: defaultChannel.amount
                  },
                  transient: true // Don't add to message history
                });
                
              } catch (error) {
                console.error('Failed to track token consumption:', error);
                // Fallback: still create unpaid chunk record
                try {
                  chunkRepo.createChunkPayment({
                    chunk_id: chunkId,
                    user_id: userId,
                    session_id: currentSessionId,
                    channel_id: defaultChannel.channel_id,
                    tokens_count: tokens,
                    is_paid: false,
                    cumulative_payment: undefined, // No payment calculation in fallback
                    remaining_balance: undefined // No balance calculation in fallback
                  });
                } catch (fallbackError) {
                  console.warn('Failed to store unpaid chunk payment:', fallbackError);
                }
              }
            }
          }
        });
        
        // Merge the streamText result into our stream
        writer.merge(result.toUIMessageStream());
      }
    });
    
    // Create the response with session header
    const response = createUIMessageStreamResponse({ stream });
    response.headers.set('X-Session-ID', currentSessionId);
    
    return response;
    
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}