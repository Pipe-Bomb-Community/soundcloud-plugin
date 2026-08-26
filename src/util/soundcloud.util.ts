import Axios from "axios";
import * as Cheerio from "cheerio";
import { SoundCloudHydratable } from "../types/soundcloud.js";
import { SoundCloud } from "scdl-core";
import { Logger } from "@pipe-bomb/plugin-sdk";

namespace SCUtils {
	let clientId: string | null = null;
	let isConnecting = false;
	const connectionWaitHandlers = new Set<() => void>();

	export function waitForConnection() {
		if (isConnecting) {
			return new Promise<void>((r) => connectionWaitHandlers.add(r));
		}
		return;
	}

	export function getClientId() {
		if (!clientId) {
			throw new Error("Client ID not set");
		}
		return clientId;
	}

	export async function generateClientId(logger: Logger) {
		if (isConnecting) {
			return;
		}
		isConnecting = true;
		try {
			const body = await Axios.get(`https://soundcloud.com`);
			const $ = Cheerio.load(body.data);
			const script = $("script")
				.map((_index, element) => $(element).html())
				.get()
				.find((script) => script?.includes("window.__sc_hydration"));

			if (!script) {
				throw new Error("Hydration script not found");
			}

			const match = script.match(
				/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);/,
			);

			if (!match || match.length < 2)
				throw new Error("Hydration data not found");

			const data = JSON.parse(match[1]!) as SoundCloudHydratable[];

			const entry = data.find((entry) => entry.hydratable == "apiClient");
			if (!entry) {
				throw new Error("Hydration apiClient not found");
			}

			const newClientId = entry.data?.id as string;
			if (typeof newClientId != "string") {
				throw new Error("Hydration Client ID not found");
			}
			clientId = newClientId;
			(SoundCloud as any).clientId = newClientId;
			logger.debug("Retrieved Client ID");
		} catch (e) {
			console.error("Failed to retrieve Client ID:", e);
		} finally {
			isConnecting = false;
			for (const callback of connectionWaitHandlers) {
				callback();
			}
			connectionWaitHandlers.clear();
		}
	}
}

export default SCUtils;
