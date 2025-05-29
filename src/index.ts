import { SapphireClient, container } from "@sapphire/framework";
import { ActivityType, GatewayIntentBits } from "discord.js";
import { WebSocket } from "ws";
import "dotenv/config";
import { connectToMcWsServer } from "./lib/ws.js";

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set in the environment variables.");
  process.exit(1);
}

if (!process.env.OWNER_DISCORD_ID) {
  console.error("OWNER_DISCORD_ID is not set in the environment variables.");
  process.exit(1);
}

if (!process.env.MC_SERVER_WS_URL) {
  console.error("MC_SERVER_WS_URL is not set in the environment variables.");
  process.exit(1);
}

if (!process.env.MAC_ADDRESS) {
  console.error("MAC_ADDRESS is not set in the environment variables.");
  process.exit(1);
}

if (!process.env.MC_SERVER_HOST) {
  console.error("MC_SERVER_HOST is not set in the environment variables.");
  process.exit(1);
}

export const CONFIG = {
  token: process.env.DISCORD_TOKEN,
  ownerId: process.env.OWNER_DISCORD_ID,
  wsUrl: process.env.MC_SERVER_WS_URL,
  macAddress: process.env.MAC_ADDRESS,
  mcServerHost: process.env.MC_SERVER_HOST,
  // In milliseconds
  reconnectDelay: 10000,
  heartbeatInterval: 5000,
  pongTimeout: 3000,
  maxActivityLength: 128,
  wakeRetryDelay: 20000,
};

// State
const mcWsClient: WebSocket | null = null;
const heartbeatIntervalId: NodeJS.Timeout | null = null;
const pongTimeoutId: NodeJS.Timeout | null = null;
const isShuttingDown: boolean = false;

declare module "@sapphire/pieces" {
  interface Container {
    mcWsClient: WebSocket | null;
    heartbeatIntervalId: NodeJS.Timeout | null;
    pongTimeoutId: NodeJS.Timeout | null;
    isShuttingDown: boolean;
  }
}

container.mcWsClient = mcWsClient;
container.heartbeatIntervalId = heartbeatIntervalId;
container.pongTimeoutId = pongTimeoutId;
container.isShuttingDown = isShuttingDown;

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  presence: {
    activities: [
      { name: "custom", type: ActivityType.Custom, state: "Booting up..." },
    ],
  },
});

client
  .login(CONFIG.token)
  .then(connectToMcWsServer)
  .catch((error) => {
    console.error("Failed to login:", error);
    process.exit(1);
  });
