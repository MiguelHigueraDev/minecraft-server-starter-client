# Discord WOL Bot

Just a simple bot that turns on a PC using Wake on LAN.

# How to use

Just enter your Discord bot token, your Discord ID, and your PC's MAC address in an .env file located in the root directory, following the structure in .env.example.

Start the bot using

`node index.js`

and then send the command `!poweron` to the bot. The bot will send the magic packet to the specified address.

I'd recommend running this on a low power device that's connected to the same network as your PC, something like a Raspberry Pi Zero 2 W.
