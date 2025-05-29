import { McStatusResponse } from "./../lib/types";
import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

const MC_STATUS_API_URL = "https://api.mcstatus.io/v2/status/java/";
const MC_ICON_API_URL = "https://api.mcstatus.io/v2/icon/";

export class DashboardCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): Awaitable<void> {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("dashboard")
        .setDescription("Send a dashboard with live stats about the server.")
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const status = await this.getServerStatus();
    if (!status) {
      return interaction.reply({
        content: "Failed to retrieve server status. Please try again later.",
        ephemeral: true,
      });
    }

    const embed = this.makeStatusEmbed(status);
    interaction.reply({
      embeds: [embed],
    });
  }

  private async getServerStatus(): Promise<McStatusResponse | null> {
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
  }

  private makeStatusEmbed(status: McStatusResponse): EmbedBuilder {
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
  }
}
