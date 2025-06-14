import { promises as fs } from "fs";

import {
  DASHBOARD_MESSAGE_ID_FILE_PATH,
  DASHBOARD_REFRESH_INTERVAL,
  MC_ICON_API_URL,
  MC_STATUS_API_URL,
} from "./constants";
import { EmbedBuilder, TextChannel } from "discord.js";
import { McStatusResponse, type SavedMessageData } from "./types";
import { container } from "@sapphire/framework";
import { logger } from "./helpers";

const readDashboardMessageIds = async (): Promise<SavedMessageData | null> => {
  try {
    const data = await fs.readFile(DASHBOARD_MESSAGE_ID_FILE_PATH, "utf8");
    const parsed = JSON.parse(data);

    if (parsed) {
      return { messageId: parsed.messageId, channelId: parsed.channelId };
    }
    return null;
  } catch (err) {
    logger("error", `Error reading dashboard message ID: ${err}`, false);
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
    logger("error", `Error writing dashboard message ID: ${err}`, false);
  }
};

export const scheduleDashboardUpdate = async (): Promise<void> => {
  const messageData = await readDashboardMessageIds();
  if (!messageData) return;

  let channel: TextChannel | undefined;
  try {
    const fetchedChannel = await container.client.channels.fetch(
      messageData.channelId
    );
    if (
      fetchedChannel &&
      fetchedChannel.isTextBased() &&
      !fetchedChannel.isDMBased()
    ) {
      channel = fetchedChannel as TextChannel;
    }
  } catch {
    return;
  }

  if (!channel) return;

  const status = await getServerStatus();
  if (!status) return;

  const embed = makeStatusEmbed(status);
  try {
    const message = await channel.messages.fetch(messageData.messageId);
    if (!message) return;
    await message.edit({ embeds: [embed] });
  } catch (error) {
    logger("error", `Error updating dashboard message: ${error}`, false);
  }
};

export const makeStatusEmbed = (status: McStatusResponse): EmbedBuilder => {
  const iconApiUrl = `${MC_ICON_API_URL}${process.env.MC_SERVER_HOST}`;
  const embed = new EmbedBuilder()
    .setTitle("Minecraft Server Status")
    .setColor(status.online ? "Green" : "Red")
    .setDescription(
      `Server is currently **${status.online ? "online" : "offline"}**\n` +
        `${
          status.online && status.players?.online
            ? `Online players: ${status.players?.list
                .map((player) => player.name_raw)
                .join(", ")}`
            : ""
        }`
    )
    .setTimestamp(new Date(status.retrieved_at));

  if (status.online && status.players?.online) {
    embed.addFields(
      {
        name: "Player count",
        value: `${status.players?.online.toString()} / ${
          status.players?.max.toString() || "0"
        }`,
        inline: true,
      },
      {
        name: "Address",
        value: `\`${status.host}\``,
        inline: true,
      }
    );
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
    logger("error", `Error fetching Minecraft server status: ${error}`, false);
    return null;
  }
};

setInterval(scheduleDashboardUpdate, DASHBOARD_REFRESH_INTERVAL);
