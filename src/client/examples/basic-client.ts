/**
 * Basic AMTP Client / Agent Example
 *
 * Run with: npm run client
 */

import { AMTPClient, AutonomousAgent } from "../amtp-client.js";

async function main() {
  const config = {
    baseUrl: process.env.AMTP_BASE_URL || "http://localhost:3000",
    timeout: 10000,
  };
  const client = new AMTPClient(config);

  console.log("🤖 AMTP Client Demo");

  try {
    // Fetch home page
    const home = await client.getPage("/");
    console.log("Home:", home.title);

    // Fetch a product
    const product = await client.getPage("/products/demo");
    console.log("Product fetched:", product.title);

    // Execute an action (note: demo impl uses /api/amtp/action)
    const buyResult = await client.executeAction("BUY", { productId: "demo", quantity: 1 });
    console.log("Action result:", buyResult.title || "ok");

    // Demo autonomous agent
    const agent = new AutonomousAgent(config);
    console.log("Autonomous agent instantiated for workflows.");

  } catch (err: any) {
    console.log("Demo note: Start `npm run server` in another shell for live demo. Error:", err.message);
  }
}

main().catch(console.error);
