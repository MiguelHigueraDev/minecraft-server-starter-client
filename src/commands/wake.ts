import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import { InteractionContextType, MessageFlags } from "discord.js";
import { wake } from "wake_on_lan";
import { CONFIG } from "..";

export class WakeCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): Awaitable<void> {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("wake")
        .setDescription("Wake up PC.")
        .setContexts([InteractionContextType.Guild])
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    wake(CONFIG.macAddress);
    return interaction.reply({
      content: "PC is waking up...",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
