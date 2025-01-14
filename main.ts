// Import necessary modules
import { ChatOpenAI } from "@langchain/openai";
import { createReadStream } from "fs";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
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

// Function to stream the output from the LLM
async function streamLLMOutput() {
  // Initialize the ChatOpenAI instance
  const chat = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4",
    temperature: 0,
  }).bindTools([calculatorTool]);

  // Create prompt template for calculator
  const messages = [
    new SystemMessage(
      `
      You are a helpful math assistant. Use the calculator function to solve math problems. Before calling the calculator function, let the user know that you are going to use the calculator function.

      Example output:
      User: What is 25 multiplied by 12?
      Assistant: I'm going to use the calculator function to solve this problem.
      Calculator: 25 * 12 = 300
      `
    ),
    new HumanMessage("What is 25 multiplied by 12?"),
  ];

  // Call the LLM with function calling
  const toolCallMessage = await chat.invoke(messages);

  const toolResultMessage = await calculatorTool.invoke(
    toolCallMessage.tool_calls![0]
  );

  console.log(toolResultMessage);

  const response = await chat.invoke([
    ...messages,
    toolCallMessage,
    toolResultMessage,
  ]);

  console.log(response);
}

// Main function to run the script
async function main() {
  await streamLLMOutput();
}

// Run the main function
main().catch(console.error);
