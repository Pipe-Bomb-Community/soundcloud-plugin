import { ConfigManager, ConfigManagerApiContext, ConfigNode } from "@pipe-bomb/plugin-sdk";
import { WideVineFiles } from "./interface/widevine-files.interface.js";

export class SoundCloudConfigManager implements ConfigManager {
	private api!: ConfigManagerApiContext;
	private wideVineFiles: WideVineFiles | null = null;

	enable(configManagerApiContext: ConfigManagerApiContext) {
		this.api = configManagerApiContext;
	}

	async getWideVineFiles(): Promise<WideVineFiles> {
		if (!this.wideVineFiles) {
			const clientIdFile = await this.api.getValue(
				"widevine_client_id_file",
				"string",
			);
			const privateKeyFile = await this.api.getValue(
				"widevine_private_key_file",
				"string",
			);
			this.wideVineFiles = {
				clientIdFile,
				privateKeyFile,
			};
		}
		return this.wideVineFiles;
	}

	async getConfigOptions(): Promise<ConfigNode> {
		const widevine = await this.getWideVineFiles();

		return {
			type: "section",
			children: [
				{
					type: "heading",
					content: "WideVine Keys",
					size: "md",
				},
				{
					type: "text",
					id: "widevine_client_id_file",
					name: "Client ID path",
					value: widevine.clientIdFile ?? "",
					placeholder: "/var/widevine/client_id.bin",
				},
				{
					type: "text",
					id: "widevine_private_key_file",
					name: "Private Key path",
					value: widevine.privateKeyFile ?? "",
					placeholder: "/var/widevine/private_key.pem",
				},
			],
		};
	}

	async update(values: Record<string, any>): Promise<ConfigNode> {
		const wideVineClientIdFile = values["widevine_client_id_file"];
		if (
			wideVineClientIdFile &&
			typeof wideVineClientIdFile == "string" &&
			this.wideVineFiles?.clientIdFile != wideVineClientIdFile
		) {
			await this.api.setValue(
				"widevine_client_id_file",
				"string",
				wideVineClientIdFile,
			);
			if (this.wideVineFiles) {
				this.wideVineFiles.clientIdFile = wideVineClientIdFile;
			} else {
				this.wideVineFiles = {
					clientIdFile: wideVineClientIdFile,
					privateKeyFile: null,
				};
			}
		}

		const wideVinePrivateKeyFile = values["widevine_private_key_file"];
		if (
			wideVinePrivateKeyFile &&
			typeof wideVinePrivateKeyFile == "string" &&
			this.wideVineFiles?.privateKeyFile != wideVinePrivateKeyFile
		) {
			await this.api.setValue(
				"widevine_private_key_file",
				"string",
				wideVinePrivateKeyFile,
			);
			if (this.wideVineFiles) {
				this.wideVineFiles.privateKeyFile = wideVinePrivateKeyFile;
			} else {
				this.wideVineFiles = {
					privateKeyFile: wideVinePrivateKeyFile,
					clientIdFile: null,
				};
			}
		}

		return this.getConfigOptions();
	}
}
