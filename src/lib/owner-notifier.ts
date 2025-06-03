// This sends notifications to the owner about certain events
// For now, it just sends a message to the owner every time a player joins or leaves

import { CONFIG } from "../index.js";
import { container } from "@sapphire/framework";

export const notifyOwner = (message: string) => {
  container.client.users.fetch(CONFIG.ownerId).then((user) => {
    user.send(message);
  });
};
