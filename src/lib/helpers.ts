import wol from "wake_on_lan";
import { CONFIG } from "../index.js";
import { container } from "@sapphire/framework";
import { ActivityType } from "discord.js";

export const wakePc = () => {
  wol.wake(CONFIG.macAddress);
};

export const isOwner = (userId: string) => userId === CONFIG.ownerId;

export const updateActivity = (activity: string) => {
  if (!container.client.isReady()) return;
  const status =
    activity.length > CONFIG.maxActivityLength
      ? activity.substring(0, CONFIG.maxActivityLength - 3) + "..."
      : activity;
  container.client.user?.setActivity("custom", {
    type: ActivityType.Custom,
    state: status,
  });
};
