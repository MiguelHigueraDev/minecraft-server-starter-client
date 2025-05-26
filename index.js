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
const MAX_ACTIVITY_LENGTH = 128;

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID;
const MC_SERVER_WS_URL = process.env.MC_SERVER_WS_URL ?? "ws://localhost:8080";

let mcWsClient = null;
let lastCommandChannel = null;
let heartbeatIntervalId = null;
let pongTimeoutId = null;
let isShuttingDown = false; // Flag to prevent reconnections during shutdown

function updateBotActivity(statusText, activityType = ActivityType.Playing) {
  if (client && client.isReady() && client.user) {
    try {
      let finalStatusText = statusText;
      if (finalStatusText.length > MAX_ACTIVITY_LENGTH) {
        finalStatusText =
          finalStatusText.substring(0, MAX_ACTIVITY_LENGTH - 3) + "...";
      }
      client.user.setActivity(finalStatusText, { type: activityType });
    } catch (error) {
      console.error("Failed to set bot activity:", error);
    }
  }
}

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

        if (pongTimeoutId) clearTimeout(pongTimeoutId);
        pongTimeoutId = setTimeout(() => {
          console.warn(
            "WebSocket pong not received in time. Terminating connection."
          );
          if (mcWsClient) {
            mcWsClient.terminate(); // This will trigger 'close' event
          }
        }, HEARTBEAT_PONG_TIMEOUT_MS);
      } catch (err) {
        console.error("Error sending WebSocket ping:", err);
        if (mcWsClient) mcWsClient.terminate();
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
  updateBotActivity("MC: Connecting...", ActivityType.Watching);
  try {
    mcWsClient = new WebSocket(MC_SERVER_WS_URL);
  } catch (error) {
    console.error("Error creating WebSocket client instance:", error);
    stopHeartbeat();
    mcWsClient = null;
    updateBotActivity("MC: Connection Failed", ActivityType.Watching);
    if (!isShuttingDown) scheduleReconnect();
    return;
  }

  mcWsClient.on("open", () => {
    console.log("Connected to Minecraft WebSocket server.");
    updateBotActivity("MC: Connected", ActivityType.Watching);
    startHeartbeat();
  });

  mcWsClient.on("message", (data) => {
    try {
      const rawDataString = data.toString();
      const message = JSON.parse(rawDataString);
      console.log("Received from MC WS Server:", message);

      if (message.type === "pong") {
        if (pongTimeoutId) {
          clearTimeout(pongTimeoutId);
          pongTimeoutId = null;
        }
        return;
      }
      handleMcServerMessage(message);
    } catch (error) {
      console.error(
        "Error parsing message from MC WS Server or handling it:",
        error
      );
      // Update activity to show there's a communication issue with the MC server WS
      updateBotActivity("MC: Data Error", ActivityType.Watching);
      // Still send the unparseable data to Discord for debugging
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
      updateBotActivity("MC: Disconnected", ActivityType.Watching);
      scheduleReconnect();
    }
  });

  mcWsClient.on("error", (err) => {
    console.error("Minecraft WebSocket connection error:", err.message);
    // Ensure heartbeat is stopped.
    stopHeartbeat();
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
      mcWsClient.terminate(); // This should trigger 'close'
    }
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
      findAndSendToDefaultChannel(messageContent);
    });
  } else if (isSystemMessage) {
    findAndSendToDefaultChannel(messageContent);
  }
}

function findAndSendToDefaultChannel(content) {
  if (client && client.isReady()) {
    const guild = client.guilds.cache.first();
    if (guild) {
      let targetChannel = guild.channels.cache.find(
        (ch) =>
          ch.name === "general" &&
          ch.isTextBased() &&
          ch.permissionsFor(guild.members.me).has("SendMessages")
      );
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
  if (message.type === "status") {
    updateBotActivity(`MC: ${message.message}`, ActivityType.Playing);
  } else if (message.type === "error") {
    // This is for errors reported by the MC server manager logic (e.g., "failed to start")
    updateBotActivity(`MC Error: ${message.message}`, ActivityType.Playing);
  } else {
    console.warn(
      "Unknown or unhandled MC Server message type for activity update:",
      message
    );
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
    await respondFunction("MAC_ADDRESS environment variable not set!");
    return;
  }
  try {
    const validatedMacAddress = parseMacAddress(macAddressStrEnv);
    wol.wake(validatedMacAddress);
    await respondFunction(`Magic packet sent!`);
  } catch (e) {
    console.error("Failed to process power-on command:", e);
    let userErrorMessage = e.message.toLowerCase().includes("mac address")
      ? `Invalid MAC address format in environment: '${macAddressStrEnv}'. Error: ${e.message}. Expected format: HH:HH:HH:HH:HH:HH or HH-HH-HH-HH-HH-HH.`
      : `Failed to send magic packet ${e.message || e}`;
    await respondFunction(userErrorMessage);
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
    setTimeout(connectToMcServer, 20000); // Give PC time to boot before attempting WebSocket connection
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
  client.user.setActivity("Booting up...", { type: ActivityType.Playing });
  connectToMcServer();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  function isOwner(authorId) {
    if (!OWNER_DISCORD_ID) {
      console.error("OWNER_DISCORD_ID not set! Cannot verify owner.");
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

  if (
    message.content.startsWith("!buttons") ||
    message.content.startsWith("!poweron") ||
    message.content.startsWith("!startserver") ||
    message.content.startsWith("!stopserver")
  ) {
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
      content: "Minecraft Server Controls:",
      components: [row],
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  lastCommandChannel = interaction.channel; // Update for any button interaction

  if (interaction.customId === "stopserver") {
    if (!OWNER_DISCORD_ID) {
      console.error("OWNER_DISCORD_ID not set for button interaction.");
      await interaction
        .reply({
          content: "Bot owner not configured. This interaction is disabled.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(console.error);
      return;
    }
    if (interaction.user.id !== OWNER_DISCORD_ID) {
      await interaction
        .reply({
          content: "You are not authorized to use this button.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(console.error);
      return;
    }
  }

  if (interaction.customId === "stopserver") {
    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "stopserver" }));
      await interaction.reply({
        content: "Attempting to stop Minecraft server...",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content:
          "Not connected to Minecraft server manager. Cannot stop server.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.customId === "startserver") {
    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "startserver" }));
      await interaction.reply({
        content: "Attempting to start Minecraft server...",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      const wakeAttempted = await attemptPowerOnForServerStart(
        interaction.channel // Send wake status messages to this channel
      );
      if (wakeAttempted) {
        await interaction.reply({
          content:
            "Wake-on-LAN initiated. Will attempt to connect to server manager shortly.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // If wake attempt failed (e.g. MAC not set, or other error in attemptPowerOn... )
        await interaction.reply({
          content:
            "Not connected to Minecraft server manager and PC wake-up failed or was not possible. Please check logs or try !poweron if authorized.",
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
    // Depending on how critical owner-only functions are, you might still exit:
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
  updateBotActivity("Bot Shutting Down...", ActivityType.Watching);
  stopHeartbeat();

  if (mcWsClient) {
    if (mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.close(1000, "Bot shutting down");
    } else if (
      mcWsClient.readyState === WebSocket.CONNECTING ||
      mcWsClient.readyState !== WebSocket.CLOSED
    ) {
      mcWsClient.terminate();
    }
    mcWsClient = null; // Ensure it's nulled after attempting close/terminate
  }

  if (client && client.isReady()) {
    client.destroy();
  }
  console.log("Discord client destroyed. Exiting in 1 second...");
  setTimeout(() => process.exit(0), 1000);
}
