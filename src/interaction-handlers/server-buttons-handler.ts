import {
  container,
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { START_SERVER, STOP_SERVER } from "../lib/constants.js";
import { WebSocket } from "ws";
import { wakePc } from "../lib/helpers.js";
import { connectToMcWsServer } from "../lib/ws.js";
import { CONFIG } from "../index.js";

export class ServerButtonsHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  public override parse(interaction: ButtonInteraction) {
    if (
      interaction.customId === START_SERVER ||
      interaction.customId === STOP_SERVER
    ) {
      return this.some();
    }
    return this.none();
  }

  public async run(interaction: ButtonInteraction) {
    const action = interaction.customId;
    if (action === START_SERVER) {
      if (container.mcWsClient?.readyState === WebSocket.OPEN) {
        // PC is already on, just send the start command
        container.mcWsClient?.send(JSON.stringify({ type: START_SERVER }));
        await interaction.reply({
          content: "Attempting to start the Minecraft server...",
          flags: [MessageFlags.Ephemeral],
        });
      } else if (action === START_SERVER) {
        console.log("PC is off, waking it up and connecting to the server");
        // PC is off, wake it up
        wakePc();
        connectToMcWsServer();
        await interaction.reply({
          content: "Waking up the PC and connecting to the Minecraft server...",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }

    if (interaction.customId === STOP_SERVER) {
      if (container.mcWsClient?.readyState !== WebSocket.OPEN) return;
      if (interaction.user.id !== CONFIG.ownerId) {
        await interaction.reply({
          content: "You are not authorized to stop the server.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      container.mcWsClient?.send(JSON.stringify({ type: STOP_SERVER }));
      await interaction.reply({
        content: "Stopping the Minecraft server...",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
}
