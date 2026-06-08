import { readFile } from "fs/promises";
import { SoundCloudConfigManager } from "./soundcloud.config-manager.js";
import { Widevine } from "widevine";

export class WideVine {
	private clientIdPath: string | null = null;
	private privateKeyPath: string | null = null;
	private client: Widevine | null = null;

	constructor(private readonly config: SoundCloudConfigManager) {}

	async getClient() {
		const fileInfo = await this.config.getWideVineFiles();
		if (!fileInfo.clientIdFile || !fileInfo.privateKeyFile) {
			return null;
		}

		if (
			this.clientIdPath != fileInfo.clientIdFile ||
			this.privateKeyPath != fileInfo.privateKeyFile ||
			!this.client
		) {
			this.clientIdPath = fileInfo.clientIdFile;
			this.privateKeyPath = fileInfo.privateKeyFile;

			const clientId = await readFile(fileInfo.clientIdFile);
			const privateKey = await readFile(fileInfo.privateKeyFile);

			this.client = Widevine.init(clientId, privateKey);
		}

		return this.client;
	}
}
