# Discord WOL Bot + Minecraft Server Starter

A Discord bot that manages a Minecraft server with Wake-on-LAN (WOL) support, real-time status monitoring, and remote server control capabilities.

## Features

- 🔌 **Wake-on-LAN Support**: Wake up sleeping or powered-off computers remotely
- 🎮 **Server Control**: Start, stop, and manage a Minecraft server through Discord commands and buttons
- 🔄 **Auto-reconnection**: Robust WebSocket connection with automatic reconnection
- 📱 **Dashboard**: Live-updating embed with server information
- ⚡ **Quick Actions**: Button-based interface for common server operations

## Prerequisites

Before setting up the bot, ensure you have:

- Node.js 18.x or higher
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))
- A Minecraft server with WebSocket support
- Network access to the target machine for Wake-on-LAN
- The MAC address of the target machine

## Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd discord-wol-bot
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
OWNER_DISCORD_ID=your_discord_user_id

# Minecraft Server Configuration
MC_SERVER_WS_URL=ws://your-server-ip:websocket-port
MC_SERVER_HOST=your-server-ip:port

# Wake-on-LAN Configuration
MAC_ADDRESS=XX:XX:XX:XX:XX:XX
```

### Configuration Variables Explained

| Variable           | Description                                      | Example                     |
| ------------------ | ------------------------------------------------ | --------------------------- |
| `DISCORD_TOKEN`    | Your Discord bot token from the Developer Portal | `[your-bots-discord-token]` |
| `OWNER_DISCORD_ID` | Your Discord user ID (for admin commands)        | `123456789012345678`        |
| `MC_SERVER_WS_URL` | WebSocket URL to your Minecraft server           | `ws://192.168.1.100:8080`   |
| `MC_SERVER_HOST`   | Minecraft server address for status checking     | `192.168.1.100:25565`       |
| `MAC_ADDRESS`      | MAC address of the target machine                | `AA:BB:CC:DD:EE:FF`         |

## Usage

### Starting the Bot

```bash
node dist/index.js
```

The bot will:

1. Connect to Discord
2. Establish a WebSocket connection to your Minecraft server
3. Begin monitoring server status
4. Update its Discord activity based on server state

### Discord Commands

#### `/wake`

Sends a Wake-on-LAN magic packet to wake up the target machine.

**Usage**: `/wake`

- Sends WOL packet to the configured MAC address
- Responds with confirmation message
- Only available in guild channels

#### `/dashboard`

Creates a live-updating dashboard showing current server status.

**Usage**: `/dashboard`

- Displays server online/offline status
- Shows current player count and list
- Updates automatically every few seconds
- Includes server icon (if available)

#### `/buttons`

Provides an interactive control panel with buttons for common server operations.

**Usage**: `/buttons`

- Wake server button
- Server control buttons
- Quick action interface

## Server Integration

The bot expects your Minecraft server to provide a WebSocket endpoint that supports:

### WebSocket Messages

#### Outgoing (Bot → Server)

```json
{
  "type": "ping"
}
```

#### Incoming (Server → Bot)

```json
{
  "type": "pong"
}
```

```json
{
  "type": "status",
  "message": "Server status message"
}
```

```json
{
  "type": "error",
  "error": "Error description"
}
```

### Status API Integration

The bot uses the [mcsrvstat.us](https://mcsrvstat.us) API to fetch detailed server information:

- Player count and list
- Server version information
- MOTD (Message of the Day)
- Server icon

## Architecture

### Project Structure

```
src/
├── commands/           # Discord slash commands
│   ├── wake.ts        # Wake-on-LAN command
│   ├── dashboard.ts   # Status dashboard command
│   └── buttons.ts     # Interactive buttons command
├── lib/               # Utility libraries
│   ├── types.ts       # TypeScript type definitions
│   ├── constants.ts   # Application constants
│   ├── helpers.ts     # Helper functions
│   ├── ws.ts          # WebSocket client
│   └── dashboard-updater.ts  # Dashboard update logic
├── interaction-handlers/  # Button/interaction handlers
│   └── server-buttons-handler.ts
└── index.ts           # Main application entry point
```

### Key Components

#### WebSocket Client (`src/lib/ws.ts`)

- Maintains persistent connection to Minecraft server
- Implements heartbeat/pong mechanism for connection health
- Handles automatic reconnection on failure
- Updates bot activity based on server status

#### Dashboard System (`src/lib/dashboard-updater.ts`)

- Fetches server status from external API
- Creates rich embeds with server information
- Updates dashboard messages in real-time
- Persists message IDs for continuous updates

#### Wake-on-LAN (`src/commands/wake.ts`)

- Sends magic packets to wake sleeping machines
- Integrates with `wake_on_lan` npm package
- Provides instant feedback to Discord users

## Network Requirements

### Wake-on-LAN Setup

For WOL to work properly:

1. **Target Machine Configuration**:

   - Enable WOL in BIOS/UEFI settings
   - Enable WOL in network adapter properties
   - Ensure "Allow this device to wake the computer" is checked

2. **Network Configuration**:

   - Both machines must be on the same subnet (for standard WOL)
   - Or configure router to forward WOL packets
   - Ensure firewall allows UDP port 9 (WOL port)

3. **Getting MAC Address**:
   - Windows: `ipconfig /all`
   - Linux/Mac: `ifconfig` or `ip addr`

### Firewall Considerations

Ensure the following ports are accessible:

- **Discord Bot**: Outbound HTTPS (443) for Discord API
- **WebSocket**: Configured WebSocket port to Minecraft server
- **Wake-on-LAN**: UDP port 9 (or 7) for magic packets
- **Minecraft Status**: Outbound HTTPS (443) for mcsrvstat.us API

## Development

### Building

```bash
npm run build
```

### Linting

```bash
npx eslint src/
```

### Development Dependencies

- TypeScript for type safety
- ESLint for code quality
- @sapphire/framework for Discord bot structure

## Troubleshooting

### Common Issues

1. **Bot Not Responding**:

   - Check Discord token validity
   - Verify bot permissions in Discord server
   - Check console logs for errors

2. **Wake-on-LAN Not Working**:

   - Verify MAC address format
   - Check target machine WOL settings
   - Ensure network connectivity
   - Test from same subnet

3. **WebSocket Connection Issues**:

   - Verify WebSocket URL format
   - Check server WebSocket implementation
   - Review firewall settings

4. **Dashboard Not Updating**:
   - Check server host configuration
   - Verify mcsrvstat.us API access
   - Review dashboard message permissions

### Debug Mode

Enable debug logging by setting environment variable:

```bash
NODE_ENV=development
```

## Contributing

Feel free to contribute by making your own fork and submitting a PR!

## Credits

- Built with [discord.js](https://discord.js.org/) and [@sapphire/framework](https://sapphirejs.dev/)
- Uses [mcsrvstat.us](https://mcsrvstat.us) for Minecraft server status
- Wake-on-LAN functionality via [wake_on_lan](https://www.npmjs.com/package/wake_on_lan) package
