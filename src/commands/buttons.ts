import {
  ApplicationCommandRegistry,
  Awaitable,
  Command,
} from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
} from "discord.js";
import { START_SERVER, STOP_SERVER } from "../lib/constants.js";

export class ButtonsCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry
  ): Awaitable<void> {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("buttons")
        .setDescription("Send the Minecraft server start and stop buttons.")
        .setContexts([InteractionContextType.Guild])
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const buttons = [
      new ButtonBuilder()
        .setCustomId(START_SERVER)
        .setLabel("Start Server")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(STOP_SERVER)
        .setLabel("Stop Server")
        .setStyle(ButtonStyle.Danger),
    ];

    return interaction.reply({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
      ],
    });
  }
}
