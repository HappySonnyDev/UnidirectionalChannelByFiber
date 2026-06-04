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

    // Generate a session ID for this conversation
    const currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Base URL for internal API calls (invoice creation)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

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
              const invoiceResponse = await fetch(`${baseUrl}/api/invoices/create`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-CKB-Address': user.address,
                },
                body: JSON.stringify({
                  amount: String(FIBER_CONFIG.PAYMENT.CHUNK_PRICE_SHANNON),
                  description: `AI chat chunk #${chunkIndex}`,
                  session_id: currentSessionId,
                }),
              });

              const invoiceData = await invoiceResponse.json();

              if (invoiceResponse.ok && invoiceData.success) {
                // Send invoice-request event through the SSE stream
                writer.write({
                  type: 'data-invoice-request',
                  data: {
                    invoice: invoiceData.invoice,
                    payment_hash: invoiceData.payment_hash,
                    amount: String(FIBER_CONFIG.PAYMENT.CHUNK_PRICE_SHANNON),
                    chunkIndex,
                  },
                } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              } else {
                console.error(`[Chat] Invoice creation failed for chunk #${chunkIndex}:`, invoiceData.error);
                writer.write({
                  type: 'data-invoice-failed',
                  data: {
                    chunkIndex,
                    error: invoiceData.error || 'Invoice creation failed',
                  },
                } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
              }
            } catch (err) {
              console.error(`[Chat] Invoice request error for chunk #${chunkIndex}:`, err);
            }
          }
        }

        // Signal text end and finish
        writer.write({ type: 'text-end', id: textId });
        writer.write({ type: 'finish-step' } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        writer.write({ type: 'finish' } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    });

    // Create the response with session header
    const response = createUIMessageStreamResponse({ stream });
    response.headers.set('X-Session-ID', currentSessionId);

    return response;

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
