import {
  streamText,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { FIBER_CONFIG } from "@/lib/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

// Use EnvHttpProxyAgent which respects NO_PROXY for localhost/127.0.0.1
setGlobalDispatcher(new EnvHttpProxyAgent());
console.log('[Proxy] Using EnvHttpProxyAgent (respects NO_PROXY)');

// Initialize Local Ollama provider (OpenAI-compatible API)
const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
  apiKey: "ollama",
  // fetch uses global EnvHttpProxyAgent which respects NO_PROXY
});

/** Number of text-delta events between each invoice request */
const TOKENS_PER_CHUNK = 20;

/** Call merchant node new_invoice RPC directly */
async function createInvoice(chunkIndex: number, isTail = false) {
  const rpcResponse = await fetch(FIBER_CONFIG.MERCHANT_NODE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'new_invoice',
      params: [{
        amount: '0x' + BigInt(FIBER_CONFIG.PAYMENT.CHUNK_PRICE_SHANNON).toString(16),
        currency: FIBER_CONFIG.INVOICE_CURRENCY,
        description: `AI chat ${isTail ? 'tail ' : ''}chunk #${chunkIndex}`,
        expiry: '0x' + FIBER_CONFIG.PAYMENT.INVOICE_EXPIRY.toString(16),
      }],
      id: 1,
    }),
  });

  const data = await rpcResponse.json();

  if (data.error) {
    throw new Error(data.error.message || 'Fiber node RPC error');
  }

  return {
    invoice: data.result.invoice_address,
    payment_hash: data.result.invoice?.data?.payment_hash,
    amount: String(FIBER_CONFIG.PAYMENT.CHUNK_PRICE_SHANNON),
  };
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication via X-CKB-Address header
    const user = getUserFromRequest(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const { messages }: { messages: UIMessage[] } = await req.json();

    // Create the AI stream with invoice-based payment integration
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        let tokenCount = 0;
        let chunkIndex = 0;
        const textId = 'text-1';

        const result = streamText({
          model: ollama(process.env.OLLAMA_MODEL || "qwen2.5:0.5b"),
          messages: convertToModelMessages(messages),
        });

        // Signal text start
        writer.write({ type: 'text-start', id: textId });

        // Process the text stream token-by-token, injecting invoice events
        const textStream = result.textStream;

        for await (const textPart of textStream) {
          // Forward the text delta to the UI immediately
          writer.write({ type: 'text-delta', delta: textPart, id: textId });

          tokenCount++;

          // Every TOKENS_PER_CHUNK tokens, create an invoice and send it
          if (tokenCount % TOKENS_PER_CHUNK === 0) {
            chunkIndex++;
            try {
              const invoiceData = await createInvoice(chunkIndex);

              writer.write({
                type: 'data-invoice-request',
                data: {
                  invoice: invoiceData.invoice,
                  payment_hash: invoiceData.payment_hash,
                  amount: invoiceData.amount,
                  chunkIndex,
                },
              } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch (err) {
              console.error(`[Chat] Invoice creation failed for chunk #${chunkIndex}:`, err);
              writer.write({
                type: 'data-invoice-failed',
                data: {
                  chunkIndex,
                  error: err instanceof Error ? err.message : 'Invoice creation failed',
                },
              } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            }
          }
        }

        // Tail chunk billing: charge for remaining tokens after stream ends
        const remainingTokens = tokenCount % TOKENS_PER_CHUNK;
        if (remainingTokens > 0 && tokenCount > 0) {
          chunkIndex++;
          try {
            const invoiceData = await createInvoice(chunkIndex, true);

            writer.write({
              type: 'data-invoice-request',
              data: {
                invoice: invoiceData.invoice,
                payment_hash: invoiceData.payment_hash,
                amount: invoiceData.amount,
                chunkIndex,
              },
            } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
          } catch (err) {
            console.error(`[Chat] Tail invoice creation failed for chunk #${chunkIndex}:`, err);
            writer.write({
              type: 'data-invoice-failed',
              data: {
                chunkIndex,
                error: err instanceof Error ? err.message : 'Tail invoice creation failed',
              },
            } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
          }
        }

        // Signal text end and finish
        writer.write({ type: 'text-end', id: textId });
        writer.write({ type: 'finish-step' } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        writer.write({ type: 'finish' } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    });

    return createUIMessageStreamResponse({ stream });

  } catch (error) {
    console.error("Chat API error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
