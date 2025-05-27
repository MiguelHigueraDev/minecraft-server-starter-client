import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} from "discord.js";
import wol from "wake_on_lan";
import WebSocket from "ws";

// Configuration
const config = {
  token: process.env.DISCORD_TOKEN,
  ownerId: process.env.OWNER_DISCORD_ID,
  wsUrl: process.env.MC_SERVER_WS_URL ?? "ws://localhost:8080",
  macAddress: process.env.MAC_ADDRESS,
  reconnectDelay: 10000,
  heartbeatInterval: 5000,
  pongTimeout: 3000,
  maxActivityLength: 128,
  wakeRetryDelay: 20000,
};

// State
let mcWsClient = null;
let heartbeatIntervalId = null;
let pongTimeoutId = null;
let isShuttingDown = false;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Utility functions
const updateActivity = (text, type = ActivityType.Playing) => {
  if (!client?.isReady()) return;
  const status =
    text.length > config.maxActivityLength
      ? text.substring(0, config.maxActivityLength - 3) + "..."
      : text;
  client.user.setActivity(status, { type });
};

const isOwner = (userId) => userId === config.ownerId;

const validateMacAddress = (mac) => {
  if (!mac || typeof mac !== "string")
    throw new Error("MAC address not provided");
  const parts = mac.split(/[:-]/);
  if (
    parts.length !== 6 ||
    !parts.every((part) => /^[0-9a-fA-F]{2}$/.test(part))
  ) {
    throw new Error(`Invalid MAC address format: ${mac}`);
  }
  return mac;
};

// WebSocket management
const stopHeartbeat = () => {
  [heartbeatIntervalId, pongTimeoutId].forEach((id) => id && clearTimeout(id));
  heartbeatIntervalId = pongTimeoutId = null;
};

const startHeartbeat = () => {
  stopHeartbeat();
  if (mcWsClient?.readyState !== WebSocket.OPEN) return;

  heartbeatIntervalId = setInterval(() => {
    if (mcWsClient?.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "ping" }));
      pongTimeoutId = setTimeout(
        () => mcWsClient?.terminate(),
        config.pongTimeout
      );
    } else {
      stopHeartbeat();
    }
  }, config.heartbeatInterval);
};

const connectToMcServer = () => {
  if (isShuttingDown || mcWsClient?.readyState <= WebSocket.OPEN) return;

  console.log("Connecting to Minecraft WebSocket server...");
  updateActivity("MC: Connecting...", ActivityType.Watching);

  mcWsClient = new WebSocket(config.wsUrl);

  mcWsClient.on("open", () => {
    console.log("Connected to Minecraft WebSocket server");
    updateActivity("MC: Connected", ActivityType.Watching);
    startHeartbeat();
  });

  mcWsClient.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("Received from MC WS:", message);

      if (message.type === "pong") {
        clearTimeout(pongTimeoutId);
        pongTimeoutId = null;
        return;
      }

      if (message.type === "status") updateActivity(`MC: ${message.message}`);
      else if (message.type === "error")
        updateActivity(`MC Error: ${message.message}`);
    } catch (error) {
      console.error("Error parsing MC WS message:", error);
      updateActivity("MC: Data Error", ActivityType.Watching);
    }
  });

  mcWsClient.on("close", (code, reason) => {
    console.log(`MC WebSocket closed: ${code} - ${reason || "N/A"}`);
    stopHeartbeat();
    mcWsClient = null;

    if (!isShuttingDown) {
      updateActivity("MC: Disconnected", ActivityType.Watching);
      setTimeout(connectToMcServer, config.reconnectDelay);
    }
  });

  mcWsClient.on("error", (err) => {
    console.error("MC WebSocket error:", err.message);
    stopHeartbeat();
  });
};

// Command handlers
const sendMagicPacket = async (respondFn) => {
  if (!config.macAddress) return respondFn("MAC_ADDRESS not configured");

  try {
    wol.wake(validateMacAddress(config.macAddress));
    await respondFn("Magic packet sent!");
  } catch (error) {
    console.error("Failed to send magic packet:", error);
    await respondFn(`Failed to send magic packet: ${error.message}`);
  }
};

const handleServerAction = async (interaction, action) => {
  if (mcWsClient?.readyState === WebSocket.OPEN) {
    mcWsClient.send(JSON.stringify({ type: action }));
    await interaction.reply({
      content: `Attempting to ${action.replace("server", "")} server...`,
      flags: MessageFlags.Ephemeral,
    });
  } else if (action === "startserver") {
    await handleOfflineServerStart(interaction);
  } else {
    await interaction.reply({
      content: "Not connected to server manager",
      flags: MessageFlags.Ephemeral,
    });
  }
};

const handleOfflineServerStart = async (interaction) => {
  if (!config.macAddress) {
    return interaction.reply({
      content: "Cannot wake PC: MAC_ADDRESS not configured",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    wol.wake(validateMacAddress(config.macAddress));
    await interaction.channel.send("Attempting to wake PC and connect...");
    setTimeout(connectToMcServer, config.wakeRetryDelay);
    await interaction.reply({
      content: "Wake-on-LAN initiated",
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("Failed to wake PC:", error);
    await interaction.reply({
      content: `Failed to wake PC: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    });
  }
};

// Event handlers
client.on("ready", () => {
  console.log(`${client.user.tag} connected!`);
  updateActivity("Starting...");
  connectToMcServer();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !isOwner(message.author.id)) return;

  const commands = {
    "!poweron": () =>
      sendMagicPacket((content) => message.channel.send(content)),
    "!buttons": () => {
      const buttons = [
        new ButtonBuilder()
          .setCustomId("startserver")
          .setLabel("Start Server")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("stopserver")
          .setLabel("Stop Server")
          .setStyle(ButtonStyle.Danger),
      ];
      return message.channel.send({
        components: [new ActionRowBuilder().addComponents(...buttons)],
      });
    },
  };

  const command = commands[message.content];
  if (command) await command();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton() || !isOwner(interaction.user.id)) {
    if (interaction.isButton()) {
      await interaction.reply({
        content: "Unauthorized",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (["startserver", "stopserver"].includes(interaction.customId)) {
    await handleServerAction(interaction, interaction.customId);
  }
});

// Startup and shutdown
const startBot = async () => {
  if (!config.token || !config.ownerId) {
    console.error(
      "Missing required environment variables: DISCORD_TOKEN, OWNER_DISCORD_ID"
    );
    process.exit(1);
  }

  try {
    await client.login(config.token);
  } catch (error) {
    console.error("Login failed:", error);
    process.exit(1);
  }
};

const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down...`);
  isShuttingDown = true;
  updateActivity("Shutting Down...", ActivityType.Watching);
  stopHeartbeat();

  if (mcWsClient?.readyState === WebSocket.OPEN) {
    mcWsClient.close(1000, "Bot shutting down");
  } else if (mcWsClient) {
    mcWsClient.terminate();
  }
  mcWsClient = null;

  client.destroy();
  setTimeout(() => process.exit(0), 1000);
};

["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, () => shutdown(signal))
);
startBot();
