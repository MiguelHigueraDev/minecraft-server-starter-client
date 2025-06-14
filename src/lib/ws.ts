import { container } from "@sapphire/framework";
import { CONFIG } from "../index.js";
import { logger, updateActivity } from "./helpers.js";
import WebSocket from "ws";
import { notifyOwner } from "./owner-notifier.js";

const stopHeartbeat = () => {
  [container.heartbeatIntervalId, container.pongTimeoutId].forEach(
    (id) => id && clearTimeout(id)
  );
  container.heartbeatIntervalId = container.pongTimeoutId = null;
};

const startHeartbeat = () => {
  stopHeartbeat();
  if (container.mcWsClient?.readyState !== WebSocket.OPEN) {
    return;
  }

  container.heartbeatIntervalId = setInterval(() => {
    if (container.mcWsClient?.readyState === WebSocket.OPEN) {
      container.mcWsClient?.send(JSON.stringify({ type: "ping" }));
      container.pongTimeoutId = setTimeout(
        () => container.mcWsClient?.terminate(),
        CONFIG.pongTimeout
      );
    } else {
      stopHeartbeat();
    }
  }, CONFIG.heartbeatInterval);
};

export const connectToMcWsServer = () => {
  if (
    container.isShuttingDown ||
    (container.mcWsClient && container.mcWsClient.readyState <= WebSocket.OPEN)
  ) {
    return;
  }

  logger("log", "Connecting to Minecraft WebSocket server...", false);
  updateActivity("Connecting to Minecraft server...");

  container.mcWsClient = new WebSocket(CONFIG.wsUrl);

  container.mcWsClient.on("open", () => {
    logger("log", "Connected to Minecraft WebSocket server.", false);
    updateActivity("Connected to Minecraft server");
    startHeartbeat();
  });

  container.mcWsClient.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger(
        "log",
        `Received message from Minecraft WebSocket server: ${message}`,
        false
      );

      if (message.type === "pong") {
        if (container.pongTimeoutId) {
          clearTimeout(container.pongTimeoutId);
        }
        container.pongTimeoutId = null;
        return;
      }

      if (message.type === "status") updateActivity(message.message);
      if (message.type === "player") notifyOwner(message.message);
      else if (message.type === "error") {
        logger(
          "error",
          `Error from Minecraft WebSocket server: ${message.error}`
        );
      }
    } catch (error) {
      logger(
        "error",
        `Error processing message from Minecraft WebSocket server: ${error}`
      );
    }
  });

  container.mcWsClient.on("close", (code, reason) => {
    logger(
      "log",
      `Minecraft WebSocket server connection closed: ${code} - ${
        reason || "N/A"
      }`,
      false
    );
    updateActivity("Disconnected from Minecraft server");
    stopHeartbeat();
    container.mcWsClient = null;
    if (!container.isShuttingDown) {
      updateActivity("Connecting to Minecraft server...");
      setTimeout(connectToMcWsServer, CONFIG.reconnectDelay);
    }
  });

  container.mcWsClient.on("error", (error) => {
    logger("error", `Error in Minecraft WebSocket connection: ${error}`, false);
    stopHeartbeat();
  });
};
