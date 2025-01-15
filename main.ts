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
    // Add a small delay for demonstration purposes
    await new Promise((resolve) => setTimeout(resolve, 500));

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
}); //.bindTools([calculatorTool]);

//const CLAUSE_BOUNDARIES = /\.|\?|!|;|,\s*(and|but|or|nor|for|yet|so)/g;
const CLAUSE_BOUNDARIES = /\.|\?|!|;|,\s/g;

/**
 * Chunk text by clause using a regex to find boundaries.
 *
 * @param text The text to split
 * @returns string[] Array of text chunks
 */
function chunkTextByClause(text: string): string[] {
  // Find clause boundaries using regular expression
  const boundariesIndices: number[] = [];
  let match: RegExpExecArray | null;

  const pattern = new RegExp(CLAUSE_BOUNDARIES);
  while ((match = pattern.exec(text)) !== null) {
    boundariesIndices.push(match.index);
  }

  const chunks: string[] = [];
  let start = 0;

  // Add chunks up to each boundary index
  for (const boundaryIndex of boundariesIndices) {
    chunks.push(text.slice(start, boundaryIndex + 1).trim());
    start = boundaryIndex + 1;
  }

  // Append remaining text after the last boundary
  const remainder = text.slice(start).trim();
  if (remainder) {
    chunks.push(remainder);
  }

  return chunks;
}

//const MAX_CHUNK_LENGTH = 100;

// function chunkTextDynamically(text: string): string[] {
//   // Find clause boundaries using regular expression
//   const boundariesIndices: number[] = [];
//   let match;

//   while ((match = CLAUSE_BOUNDARIES.exec(text)) !== null) {
//     boundariesIndices.push(match.index);
//   }

//   const chunks: string[] = [];
//   let start = 0;

//   // Add chunks until the last clause boundary
//   for (const boundaryIndex of boundariesIndices) {
//     let chunk = text.slice(start, boundaryIndex + 1).trim();
//     if (chunk.length <= MAX_CHUNK_LENGTH) {
//       chunks.push(chunk);
//     } else {
//       // Split by comma if it doesn't create subchunks less than three words
//       const subchunks = chunk.split(",");
//       let tempChunk = "";
//       for (const subchunk of subchunks) {
//         if (tempChunk.length + subchunk.length <= MAX_CHUNK_LENGTH) {
//           tempChunk += subchunk + ",";
//         } else {
//           if (tempChunk.split(" ").length >= 3) {
//             chunks.push(tempChunk.trim());
//           }
//           tempChunk = subchunk + ",";
//         }
//       }
//       if (tempChunk) {
//         if (tempChunk.split(" ").length >= 3) {
//           chunks.push(tempChunk.trim());
//         }
//       }
//     }
//     start = boundaryIndex + 1;
//   }

//   // Split remaining text into subchunks if needed
//   const remainingText = text.slice(start).trim();
//   if (remainingText) {
//     const remainingSubchunks =
//       remainingText.match(new RegExp(`.{1,${MAX_CHUNK_LENGTH}}`, "g")) || [];
//     chunks.push(...remainingSubchunks);
//   }

//   return chunks;
// }

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
      //console.log("tool_call_chunks", chunk.tool_call_chunks);
    }

    // stream the user-facing chunk
    if (chunk.content) {
      yield chunk.content;
    }
  }

  // if there is concatenated tool call message, we can call the tool
  // if (toolCallMessage) {
  //   console.log("toolCallMessage", toolCallMessage);
  //   const toolResultMessage = await calculatorTool.invoke(
  //     toolCallMessage!.tool_calls![0]
  //   );
  //   console.log("toolResultMessage", toolResultMessage);
  //   // stream the final response from LLM
  //   stream = await chat.stream([
  //     ...messages,
  //     toolCallMessage,
  //     toolResultMessage,
  //   ]);

  //   for await (const chunk of stream) {
  //     // stream the final response from LLM
  //     if (chunk.content) {
  //       yield chunk.content;
  //     }
  //   }
  // }
}

async function main() {
  const messages = [
    new SystemMessage(
      `
      Always response this exact sentence, no matter the user input:
      "Great! Now that we have the date of birth, let's proceed.I see that the patient, Jordon Streich, needs to be scheduled for a "New Patient" visit since there are no previous appointments. Would you like to proceed with scheduling a New Patient appointment?."
      `
    ),
    // new SystemMessage(
    //   `
    //   No matter the user input always response with 4-5 sentences in natural language as a helpful assistant.
    //   `
    // ),
    // new SystemMessage(
    //   `
    //   Always response with the exact following text, no matter the user input:
    //   Text to produce:
    //   "
    //     The product of 25 multiplied by 12 is 300.
    //     This is a simple multiplication problem that you can solve by multiplying the two numbers together.
    //     If you're ever unsure about a multiplication problem, you can always use a calculator or a multiplication table.
    //   "
    //   `
    // ),
    new HumanMessage("What is 25 multiplied by 12?"),
  ];

  let buffer = "";

  for await (const chunk of agentStream(messages)) {
    console.log("chunk", chunk);
    buffer += chunk;
    const chunks = chunkTextByClause(buffer);
    //console.log("chunks", chunks);
    if (chunks.length > 1) {
      //simulated sending to TTS
      console.log("User-facing chunk:", chunks[0]);
      buffer = chunks[1];
    }
  }

  //IMPORTANT: do not forget to send the last buffer left-over to TTS
  //simulated sending to TTS
  console.log("User-facing chunk:", buffer);
}

// Run the main function
main().catch(console.error);
