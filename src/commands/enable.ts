import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import { ActivityType, InteractionContextType, MessageFlags } from "discord.js";
import { CONFIG } from "..";

export class EnableCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): Awaitable<void> {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("enable")
        .setDescription("Enable the bot.")
        .setContexts([InteractionContextType.Guild])
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    CONFIG.isEnabled = true;
    interaction.client.user.presence.set({
      status: "online",
      activities: [
        { name: "custom", type: ActivityType.Custom, state: "Enabled" },
      ],
    });
    return interaction.reply({
      content: "Bot enabled.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
