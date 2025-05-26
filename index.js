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

// Constants
const RECONNECTION_DELAY_MS = 10000; // 10 seconds
const HEARTBEAT_INTERVAL_MS = 5000; // Send ping every 5 seconds
const HEARTBEAT_PONG_TIMEOUT_MS = 3000; // Expect pong within 3 seconds

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID;
const MC_SERVER_WS_URL = process.env.MC_SERVER_WS_URL ?? "ws://localhost:8080";

let mcWsClient = null;
let lastCommandChannel = null;
let heartbeatIntervalId = null;
let pongTimeoutId = null;
let isShuttingDown = false; // Flag to prevent reconnections during shutdown

function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  if (pongTimeoutId) {
    clearTimeout(pongTimeoutId);
    pongTimeoutId = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();

  if (!mcWsClient || mcWsClient.readyState !== WebSocket.OPEN) {
    console.log("Cannot start heartbeat: WebSocket is not open.");
    return;
  }

  heartbeatIntervalId = setInterval(() => {
    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      try {
        mcWsClient.send(JSON.stringify({ type: "ping" }));

        // Clear previous pong timeout just in case, then set a new one
        if (pongTimeoutId) clearTimeout(pongTimeoutId);
        pongTimeoutId = setTimeout(() => {
          console.warn(
            "WebSocket pong not received in time. Terminating connection."
          );
          if (mcWsClient) {
            mcWsClient.terminate();
          }
        }, HEARTBEAT_PONG_TIMEOUT_MS);
      } catch (err) {
        console.error("Error sending WebSocket ping:", err);
        if (mcWsClient) mcWsClient.terminate(); // Likely connection broken
      }
    } else {
      stopHeartbeat();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function connectToMcServer() {
  if (isShuttingDown) {
    console.log(
      "Shutdown in progress, not attempting to connect to MC server."
    );
    return;
  }
  if (
    mcWsClient &&
    (mcWsClient.readyState === WebSocket.OPEN ||
      mcWsClient.readyState === WebSocket.CONNECTING)
  ) {
    console.log(
      "Already connected or connecting to the Minecraft WebSocket server."
    );
    return;
  }

  console.log("Attempting to connect to Minecraft WebSocket server...");
  try {
    mcWsClient = new WebSocket(MC_SERVER_WS_URL);
  } catch (error) {
    console.error("Error creating WebSocket client instance:", error);
    stopHeartbeat();
    mcWsClient = null;
    if (!isShuttingDown) scheduleReconnect();
    return;
  }

  mcWsClient.on("open", () => {
    console.log("Connected to Minecraft WebSocket server.");
    /*sendToDiscordChannel(
      "Successfully connected to the Minecraft server manager.",
      true
    );*/
    startHeartbeat();
  });

  mcWsClient.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("Received from MC WS Server:", message);

      if (message.type === "pong") {
        if (pongTimeoutId) {
          clearTimeout(pongTimeoutId);
          pongTimeoutId = null;
        }
        return; // Pong handled
      }
      handleMcServerMessage(message);
    } catch (error) {
      console.error(
        "Error parsing message from MC WS Server or handling it:",
        error
      );
      sendToDiscordChannel(
        `Received unparseable data from MC Server: ${data
          .toString()
          .substring(0, 100)}`,
        false
      );
    }
  });

  mcWsClient.on("close", (code, reason) => {
    const reasonString = reason ? reason.toString() : "N/A";
    console.log(
      `Disconnected from Minecraft WebSocket server. Code: ${code}, Reason: ${reasonString}`
    );
    stopHeartbeat();
    mcWsClient = null;

    if (isShuttingDown) {
      console.log(
        "WebSocket closed as part of bot shutdown. No reconnection scheduled."
      );
    } else {
      /*sendToDiscordChannel(
        `Disconnected from Minecraft server manager. (Code: ${code}) Attempting to reconnect...`,
        false
      );*/
      scheduleReconnect();
    }
  });

  mcWsClient.on("error", (err) => {
    console.error("Minecraft WebSocket connection error:", err.message);
    stopHeartbeat();
    // The 'close' event will usually follow an error that breaks the connection.
    // If the socket is in a weird state and not OPEN/CONNECTING but also not CLOSING/CLOSED,
    // explicitly terminate it to ensure the 'close' event fires for cleanup and reconnection.
    if (
      mcWsClient &&
      mcWsClient.readyState !== WebSocket.OPEN &&
      mcWsClient.readyState !== WebSocket.CONNECTING &&
      mcWsClient.readyState !== WebSocket.CLOSING &&
      mcWsClient.readyState !== WebSocket.CLOSED
    ) {
      console.log(
        `WebSocket in unexpected state ${mcWsClient.readyState} after error, terminating.`
      );
      mcWsClient.terminate();
    }
    // No need to set mcWsClient = null or call scheduleReconnect() here explicitly,
    // as the 'close' event handler is responsible for that if the connection truly breaks.
  });
}

function scheduleReconnect() {
  if (isShuttingDown) {
    console.log("Shutdown in progress, not scheduling reconnection.");
    return;
  }
  console.log(
    `Scheduling reconnection to MC WebSocket server in ${
      RECONNECTION_DELAY_MS / 1000
    } seconds...`
  );
  setTimeout(connectToMcServer, RECONNECTION_DELAY_MS);
}

function sendToDiscordChannel(content, isSystemMessage = false) {
  const messageContent = "```\n" + content + "\n```";
  if (lastCommandChannel) {
    lastCommandChannel.send(messageContent).catch((err) => {
      console.error("Error sending to lastCommandChannel:", err);
      // Fallback if lastCommandChannel is no longer valid
      findAndSendToDefaultChannel(messageContent);
    });
  } else if (isSystemMessage) {
    findAndSendToDefaultChannel(messageContent);
  }
}

function findAndSendToDefaultChannel(content) {
  // Try to find a general/default channel if client is ready
  if (client && client.isReady()) {
    const guild = client.guilds.cache.first();
    if (guild) {
      // Prefer channel named 'general'
      let targetChannel = guild.channels.cache.find(
        (ch) =>
          ch.name === "general" &&
          ch.isTextBased() &&
          ch.permissionsFor(guild.members.me).has("SendMessages")
      );
      // Fallback to first text channel bot can send to
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(
          (ch) =>
            ch.isTextBased() &&
            ch.permissionsFor(guild.members.me).has("SendMessages")
        );
      }

      if (targetChannel) {
        targetChannel.send(content).catch(console.error);
        return;
      }
    }
  }
  console.log(
    "MC Server Update (no suitable default Discord channel found):",
    content.replace(/`/g, "")
  );
}

function handleMcServerMessage(message) {
  let discordMessage = "";
  if (message.type === "status") {
    discordMessage = `[MC Server Status] ${message.message}`;
  } else if (message.type === "error") {
    discordMessage = `[MC Server Error] ${message.message}`;
  } else {
    discordMessage = `[MC Server] Unknown message type received.`;
    console.warn("Unknown MC Server message:", message);
  }

  if (discordMessage && discordMessage.length > 0) {
    // Disable messages for now
    // sendToDiscordChannel(discordMessage);
  }
}

function parseMacAddress(macStr) {
  if (!macStr || typeof macStr !== "string") {
    throw new Error("MAC address string is undefined, empty, or not a string.");
  }

  const parts = macStr.split(/[:-]/);

  if (parts.length !== 6) {
    throw new Error(
      `MAC address '${macStr}' must have 6 octets, found ${parts.length}`
    );
  }

  for (const part of parts) {
    // Check if each part is a 2-character hex string
    if (!/^[0-9a-fA-F]{2}$/.test(part)) {
      throw new Error(
        `Invalid hex component '${part}' in MAC address '${macStr}'. Each octet must be 2 hex characters.`
      );
    }
  }
  return macStr;
}

async function handlePowerOnCommand(respondFunction) {
  const macAddressStrEnv = process.env.MAC_ADDRESS;

  if (!macAddressStrEnv) {
    const response = "MAC_ADDRESS environment variable not set!";
    try {
      await respondFunction(response);
    } catch (err) {
      console.error("Error sending 'MAC_ADDRESS not set' message:", err);
    }
    return;
  }

  try {
    const validatedMacAddress = parseMacAddress(macAddressStrEnv);

    wol.wake(validatedMacAddress);
    const response = `Magic packet sent!`;
    await respondFunction(response);
  } catch (e) {
    console.error("Failed to process power-on command:", e);

    let userErrorMessage;
    if (e.message.toLowerCase().includes("mac address")) {
      userErrorMessage = `Invalid MAC address format in environment: '${macAddressStrEnv}'. Error: ${e.message}. Expected format: HH:HH:HH:HH:HH:HH or HH-HH-HH-HH-HH-HH.`;
    } else {
      userErrorMessage = `Failed to send magic packet ${e.message || e}`;
    }

    try {
      await respondFunction(userErrorMessage);
    } catch (err) {
      console.error("Error sending error message to Discord:", err);
    }
  }
}

async function attemptPowerOnForServerStart(channel) {
  const macAddressStrEnv = process.env.MAC_ADDRESS;

  if (!macAddressStrEnv) {
    await channel.send(
      "Cannot wake PC: MAC_ADDRESS environment variable not set!"
    );
    return false;
  }

  try {
    const validatedMacAddress = parseMacAddress(macAddressStrEnv);
    wol.wake(validatedMacAddress);
    await channel.send(
      `No connection to server manager. Attempting to wake PC and will retry connection...`
    );

    // Give some time for PC to boot before attempting connection
    setTimeout(connectToMcServer, 15000); // Increased delay to 15s
    return true;
  } catch (e) {
    console.error("Failed to wake PC for server start:", e);
    await channel.send(`Failed to wake PC: ${e.message}`);
    return false;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`${client.user.tag} is connected!`);
  client.user.setActivity("to wake my PC", { type: ActivityType.Playing });
  connectToMcServer();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  function isOwner(authorId) {
    if (!OWNER_DISCORD_ID) {
      console.error(
        "OWNER_DISCORD_ID environment variable not set! Cannot verify owner."
      );
      message
        .reply("Bot owner not configured. This command is disabled.")
        .catch(() => {});
      return false;
    }
    if (authorId !== OWNER_DISCORD_ID) {
      message
        .reply("You are not authorized to use this command.")
        .catch(() => {});
      return false;
    }
    return true;
  }

  if (message.content.startsWith("!buttons")) {
    lastCommandChannel = message.channel;
  }

  if (message.content === "!poweron") {
    if (!isOwner(message.author.id)) return;
    await handlePowerOnCommand((content) => message.channel.send(content));
  }

  if (message.content === "!buttons") {
    if (!isOwner(message.author.id)) return;
    const startServerButton = new ButtonBuilder()
      .setCustomId("startserver")
      .setLabel("Start Minecraft Server")
      .setStyle(ButtonStyle.Primary);
    const stopServerButton = new ButtonBuilder()
      .setCustomId("stopserver")
      .setLabel("Stop Minecraft Server")
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(
      startServerButton,
      stopServerButton
    );
    await message.channel.send({
      content: "",
      components: [row],
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "stopserver") {
    lastCommandChannel = interaction.channel; // Update last command channel

    if (!OWNER_DISCORD_ID) {
      console.error(
        "OWNER_DISCORD_ID environment variable not set! Cannot verify owner for button interaction."
      );
      const response =
        "Bot owner not configured. This interaction is disabled.";
      try {
        await interaction.reply({
          content: response,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.error("Error sending 'OWNER_DISCORD_ID not set' message:", err);
      }
      return;
    }

    if (interaction.user.id !== OWNER_DISCORD_ID) {
      await interaction.reply({
        content: "You are not authorized to use this button.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    mcWsClient.send(JSON.stringify({ type: "stopserver" }));

    await interaction.reply({
      content: "Attempting to stop Minecraft server...",
      flags: MessageFlags.Ephemeral,
    });
  } else if (interaction.customId === "startserver") {
    lastCommandChannel = interaction.channel;

    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "startserver" }));
      await interaction.reply({
        content: "Attempting to start Minecraft server...",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const wakeAttempted = await attemptPowerOnForServerStart(
        interaction.channel
      );
      if (!wakeAttempted) {
        await interaction.reply({
          content:
            "Not connected to Minecraft server manager and cannot wake PC. Please check the server status manually or try !poweron if authorized.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
});

async function startBot() {
  if (!TOKEN) {
    console.error("DISCORD_TOKEN environment variable is not set. Exiting.");
    process.exit(1);
  }

  if (!OWNER_DISCORD_ID) {
    console.warn(
      "OWNER_DISCORD_ID environment variable is not set. Owner-specific commands will not work."
    );
    console.error(
      "OWNER_DISCORD_ID environment variable is not set. Exiting, as it's crucial for most bot functions."
    );
    process.exit(1);
  }

  try {
    await client.login(TOKEN);
  } catch (error) {
    console.error("Client login error:", error);
    process.exit(1);
  }
}

startBot();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal) {
  console.log(`Received ${signal}. Bot and MC WS Client are shutting down...`);
  isShuttingDown = true;
  stopHeartbeat();

  if (mcWsClient) {
    if (mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.close(1000, "Bot shutting down");
    } else if (mcWsClient.readyState === WebSocket.CONNECTING) {
      mcWsClient.terminate();
    }
  }

  client.destroy();
  console.log("Discord client destroyed. Exiting in 1 second...");
  setTimeout(() => process.exit(0), 1000);
}
