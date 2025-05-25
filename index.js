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

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID;

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
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  if (message.content === "!poweron") {
    // Check if the user is authorized
    if (!OWNER_DISCORD_ID) {
      const response = "OWNER_DISCORD_ID environment variable not set!";
      try {
        await message.channel.send(response);
      } catch (err) {
        console.error("Error sending 'OWNER_DISCORD_ID not set' message:", err);
      }
      return;
    }

    if (message.author.id !== OWNER_DISCORD_ID) {
      return;
    }

    await handlePowerOnCommand((content) => message.channel.send(content));
  }

  if (message.content === "!button") {
    const powerOnButton = new ButtonBuilder()
      .setCustomId("poweron")
      .setLabel("Power On")
      .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(powerOnButton);
    const response = "Click the button to power on the PC!";
    try {
      await message.channel.send({ content: response, components: [row] });
    } catch (err) {
      console.error("Error sending button message:", err);
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
