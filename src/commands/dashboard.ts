import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import { ChatInputCommandInteraction } from "discord.js";
import {
  getServerStatus,
  makeStatusEmbed,
  writeDashboardMessageIds,
} from "../lib/dashboard-updater";

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
    const status = await getServerStatus();
    if (!status) {
      return interaction.reply({
        content: "Failed to retrieve server status. Please try again later.",
        ephemeral: true,
      });
    }

    const embed = makeStatusEmbed(status);
    const reply = await interaction.reply({
      embeds: [embed],
    });

    // Store the message and channel IDs for future updates
    const message = await reply.fetch();
    await writeDashboardMessageIds(message.id, interaction.channelId);
  }
}
