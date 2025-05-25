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
// Timeout for reconnection attempts to the WebSocket server
const RECONNECTION_DELAY_MS = 10000; // 10 seconds
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID;
const MC_SERVER_WS_URL = process.env.MC_SERVER_WS_URL ?? "ws://localhost:8080";

let mcWsClient = null;
let lastCommandChannel = null; // Send MC Server updates here

function connectToMcServer() {
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
    console.error("Error creating WebSocket client:", error);
    scheduleReconnect();
    return;
  }

  mcWsClient.on("open", () => {
    console.log("Connected to Minecraft WebSocket server.");
    sendToDiscordChannel(
      "Successfully connected to the Minecraft server manager.",
      true
    );
  });

  mcWsClient.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("Received from MC WS Server:", message);
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
    sendToDiscordChannel(
      `Disconnected from Minecraft server manager. (Code: ${code}) Attempting to reconnect...`,
      false
    );
    mcWsClient = null;
    scheduleReconnect();
  });

  mcWsClient.on("error", (err) => {
    console.error("Minecraft WebSocket connection error:", err.message);
    if (
      mcWsClient &&
      mcWsClient.readyState !== WebSocket.CLOSED &&
      mcWsClient.readyState !== WebSocket.CLOSING
    ) {
      mcWsClient.terminate(); // Force close if it's stuck
    }
    mcWsClient = null;
  });
}

function scheduleReconnect() {
  console.log(
    "Scheduling reconnection to MC WebSocket server in 10 seconds..."
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
    sendToDiscordChannel(discordMessage);
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
    const response = `Magic packet sent to ${validatedMacAddress}!`;
    await respondFunction(response);
  } catch (e) {
    console.error("Failed to process power-on command:", e);

    let userErrorMessage;
    if (e.message.toLowerCase().includes("mac address")) {
      userErrorMessage = `Invalid MAC address format in environment: '${macAddressStrEnv}'. Error: ${e.message}. Expected format: HH:HH:HH:HH:HH:HH or HH-HH-HH-HH-HH-HH.`;
    } else {
      userErrorMessage = `Failed to send magic packet to ${macAddressStrEnv}: ${
        e.message || e
      }`;
    }

    try {
      await respondFunction(userErrorMessage);
    } catch (err) {
      console.error("Error sending error message to Discord:", err);
    }
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
      throw new Error("OWNER_DISCORD_ID environment variable not set!");
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
    message.content.startsWith("!poweron") ||
    message.content.startsWith("!button") ||
    message.content.startsWith("!mc")
  ) {
    lastCommandChannel = message.channel;
  }

  if (message.content === "!poweron") {
    if (!isOwner(message.author.id)) return;
    await handlePowerOnCommand((content) => message.channel.send(content));
  }

  if (message.content === "!button") {
    if (!isOwner(message.author.id)) return;
    const powerOnButton = new ButtonBuilder()
      .setCustomId("poweron")
      .setLabel("Power On PC")
      .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(powerOnButton);
    await message.channel.send({
      content: "Click the button to power on the PC!",
      components: [row],
    });
  }

  // Allow non-owners to only start the server
  if (message.content === "!mcstart") {
    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "startserver" }));
      message.channel.send("Attempting to start Minecraft server...");
    } else {
      message.channel.send(
        "Not connected to Minecraft server manager. Please wait or check its status."
      );
    }
  } else if (message.content === "!mcstop") {
    if (!isOwner(message.author.id)) return;
    if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
      mcWsClient.send(JSON.stringify({ type: "stopserver" }));
      message.channel.send("Attempting to stop Minecraft server...");
    } else {
      message.channel.send(
        "Not connected to Minecraft server manager. Please wait or check its status."
      );
    }
  } else if (message.content.startsWith("!mccmd")) {
    if (!isOwner(message.author.id)) return;
    const command = message.content.substring("!mccmd ".length).trim();
    if (command) {
      if (mcWsClient && mcWsClient.readyState === WebSocket.OPEN) {
        mcWsClient.send(JSON.stringify({ type: "sendcommand", command }));
        message.channel.send(
          `Sent \`${command}\` command to Minecraft server:`
        );
      } else {
        message.channel.send(
          "Not connected to Minecraft server manager. Please wait or check its status."
        );
      }
    } else {
      message.channel.send("Please provide a command to send to the server.");
      return;
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "poweron") {
    // Check if the user is authorized
    if (!OWNER_DISCORD_ID) {
      const response = "OWNER_DISCORD_ID environment variable not set!";
      try {
        await interaction.reply({
          content: response,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.error("Error sending 'OWNER_DISCORD_ID not set' message:", err);
      }
      return;
    }

    if (interaction.user.id !== OWNER_DISCORD_ID) {
      return;
    }

    await handlePowerOnCommand((content) =>
      interaction.reply({ content, flags: [MessageFlags.Ephemeral] })
    );
  }
});

async function startBot() {
  if (!TOKEN) {
    console.error("DISCORD_TOKEN environment variable is not set. Exiting.");
    process.exit(1);
  }

  if (!OWNER_DISCORD_ID) {
    console.error("OWNER_DISCORD_ID environment variable is not set. Exiting.");
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
// Graceful shutdown on SIGINT and SIGTERM
process.on("SIGINT", () => {
  console.log("Bot is shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Bot is shutting down...");
  client.destroy();
  process.exit(0);
});
