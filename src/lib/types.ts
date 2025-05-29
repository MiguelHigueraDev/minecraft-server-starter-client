export type McStatusResponse = {
  // Always present
  online: boolean;
  host: string;
  port: number;
  ip_address: string;
  eula_blocked: boolean;
  retrieved_at: number;
  expires_at: number;
  srv_record: any;
  // May be present only if online is true
  version?: McStatusVersion;
  players?: McStatusPlayers;
  motd?: McStatusMotd;
  icon?: string;
  mods?: string[];
  software?: string;
  plugins?: string[];
};

type McStatusVersion = {
  name_raw: string;
  name_clean: string;
  name_html: string;
  protocol: number;
};

type McStatusPlayers = {
  online: number;
  max: number;
  list: McStatusPlayer[];
};

type McStatusPlayer = {
  uuid: string;
  name_raw: string;
  name_clean: string;
  name_html: string;
};

type McStatusMotd = {
  raw: string;
  clean: string;
  html: string;
};

export type SavedMessageData = {
  messageId: string;
  channelId: string;
};
