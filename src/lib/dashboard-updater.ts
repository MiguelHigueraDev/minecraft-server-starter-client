import { promises as fs } from "fs";

import {
  DASHBOARD_MESSAGE_ID_FILE_PATH,
  DASHBOARD_REFRESH_INTERVAL,
  MC_ICON_API_URL,
  MC_STATUS_API_URL,
} from "./constants";
import { EmbedBuilder } from "discord.js";
import { McStatusResponse, type SavedMessageData } from "./types";
import { container } from "@sapphire/framework";

const readDashboardMessageIds = async (): Promise<SavedMessageData | null> => {
  try {
    const data = await fs.readFile(DASHBOARD_MESSAGE_ID_FILE_PATH, "utf8");
    const parsed = JSON.parse(data);

    if (parsed) {
      return { messageId: parsed.messageId, channelId: parsed.channelId };
    }
    return null;
  } catch (err) {
    console.error("Error reading dashboard message ID:", err);
    return null;
  }
};

export const writeDashboardMessageIds = async (
  messageId: string,
  channelId: string
): Promise<void> => {
  try {
    const data = { messageId, channelId };
    await fs.writeFile(
      DASHBOARD_MESSAGE_ID_FILE_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Error writing dashboard message ID:", err);
  }
};

export const scheduleDashboardUpdate = async (): Promise<void> => {
  const messageData = await readDashboardMessageIds();
  if (!messageData) return;

  const channel = container.client.channels.cache.get(messageData.channelId);

  if (!channel || !channel.isTextBased()) return;

  const status = await getServerStatus();
  if (!status) return;

  const embed = makeStatusEmbed(status);
  try {
    const message = channel.messages.cache.get(messageData.messageId);
    if (!message) return;
    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error("Error updating dashboard message:", error);
  }
};

export const makeStatusEmbed = (status: McStatusResponse): EmbedBuilder => {
  const iconApiUrl = `${MC_ICON_API_URL}${process.env.MC_SERVER_HOST}`;
  const embed = new EmbedBuilder()
    .setTitle("Minecraft Server Status")
    .setColor(status.online ? "Green" : "Red")
    .setDescription(
      `Server is currently **${status.online ? "online" : "offline"}**\n` +
        `Address: \`${status.host}\`\n`
    )
    .setTimestamp(new Date(status.retrieved_at));

  if (status.online && status.players?.online) {
    embed.addFields({
      name: "Online players",
      value: status.players?.online.toString() || "0",
      inline: true,
    });
  }

  if (status.icon) {
    embed.setThumbnail(iconApiUrl);
  }

  return embed;
};

export const getServerStatus = async (): Promise<McStatusResponse | null> => {
  const apiUrl = `${MC_STATUS_API_URL}${process.env.MC_SERVER_HOST}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: McStatusResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Minecraft server status:", error);
    return null;
  }
};

setInterval(scheduleDashboardUpdate, DASHBOARD_REFRESH_INTERVAL);
