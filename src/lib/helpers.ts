import wol from "wake_on_lan";
import { CONFIG } from "../index.js";
import { container } from "@sapphire/framework";
import { ActivityType } from "discord.js";
import { notifyOwner } from "./owner-notifier.js";

export const wakePc = () => {
  wol.wake(CONFIG.macAddress);
};

export const isOwner = (userId: string) => userId === CONFIG.ownerId;

export const updateActivity = (activity: string) => {
  if (!container.client.isReady() || !CONFIG.isEnabled) return;
  const status =
    activity.length > CONFIG.maxActivityLength
      ? activity.substring(0, CONFIG.maxActivityLength - 3) + "..."
      : activity;
  container.client.user?.setActivity("custom", {
    type: ActivityType.Custom,
    state: status,
  });
};

type LogType = "log" | "warn" | "error" | "info";

export const logger = (type: LogType, message: string, notify = true) => {
  const timestamp = new Date().toISOString();
  console[type](`[${type.toUpperCase()}] (${timestamp}) ${message}`);
  if (notify) {
    notifyOwner(`[${type.toUpperCase()}] (${timestamp}) ${message}`);
  }
};

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
