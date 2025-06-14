import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import { ActivityType, InteractionContextType, MessageFlags } from "discord.js";
import { CONFIG } from "..";

export class DisableCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): Awaitable<void> {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("disable")
        .setDescription("Disable the bot.")
        .setContexts([InteractionContextType.Guild])
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    CONFIG.isEnabled = false;
    interaction.client.user.presence.set({
      status: "dnd",
      activities: [
        { name: "custom", type: ActivityType.Custom, state: "Disabled" },
      ],
    });
    return interaction.reply({
      content: "Bot disabled.",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
