// Import necessary modules
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import {
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { concat } from "@langchain/core/utils/stream";

// Load environment variables
dotenv.config();

/**
 * Note that the descriptions here are crucial, as they will be passed along
 * to the model along with the class name.
 */
const calculatorSchema = z.object({
  operation: z
    .enum(["add", "subtract", "multiply", "divide"])
    .describe("The type of operation to execute."),
  number1: z.number().describe("The first number to operate on."),
  number2: z.number().describe("The second number to operate on."),
});

const calculatorTool = tool(
  async ({ operation, number1, number2 }) => {
    // Functions must return strings
    if (operation === "add") {
      return `${number1 + number2}`;
    } else if (operation === "subtract") {
      return `${number1 - number2}`;
    } else if (operation === "multiply") {
      return `${number1 * number2}`;
    } else if (operation === "divide") {
      return `${number1 / number2}`;
    } else {
      throw new Error("Invalid operation.");
    }
  },
  {
    name: "calculator",
    description: "Can perform mathematical operations.",
    schema: calculatorSchema,
  }
);

// Initialize the ChatOpenAI instance
const chat = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4",
  temperature: 0,
}).bindTools([calculatorTool]);

async function* agentStream(messages: BaseMessage[]) {
  // Call the LLM with function calling
  let stream = await chat.stream(messages);

  let toolCallMessage: AIMessageChunk | undefined = undefined;
  for await (const chunk of stream) {
    // tool chunks are there only when the LLM is calling the tool
    if (chunk.tool_call_chunks) {
      // concat the tool call message with the current chunk
      toolCallMessage =
        toolCallMessage !== undefined ? concat(toolCallMessage, chunk) : chunk;
      console.log("tool_call_chunks", chunk.tool_call_chunks);
    }

    // stream the user-facing chunk
    if (chunk.content) {
      yield chunk.content;
    }
  }

  // if there is concatenated tool call message, we can call the tool
  if (toolCallMessage) {
    console.log("toolCallMessage", toolCallMessage);
    const toolResultMessage = await calculatorTool.invoke(
      toolCallMessage!.tool_calls![0]
    );
    console.log("toolResultMessage", toolResultMessage);
    // stream the final response from LLM
    stream = await chat.stream([
      ...messages,
      toolCallMessage,
      toolResultMessage,
    ]);

    for await (const chunk of stream) {
      // stream the final response from LLM
      if (chunk.content) {
        yield chunk.content;
      }
    }
  }
}

async function main() {
  const messages = [
    new SystemMessage(
      `
      You are a helpful math assistant. Use the calculator function to solve math problems. Before calling the calculator function, let the user know that you are going to use the calculator function.
      `
    ),
    new HumanMessage("What is 25 multiplied by 12?"),
  ];

  for await (const chunk of agentStream(messages)) {
    console.log("User-facing chunk:", chunk);
  }
}

// Run the main function
main().catch(console.error);
