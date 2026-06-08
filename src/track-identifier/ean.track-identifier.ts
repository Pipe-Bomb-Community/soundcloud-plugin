import {
	IdentifierDependency,
	TrackIdentifier,
	TrackIdentifierTarget,
	TrackInformationHelper,
} from "@sdk";
import { SoundCloudCache } from "../soundcloud-cache.js";

export class EANTrackIdentifier implements TrackIdentifier {
	public readonly target: TrackIdentifierTarget = "track";
	public readonly id = "ean";

	constructor(private readonly cache: SoundCloudCache) {}

	async identify(helper: TrackInformationHelper): Promise<string[] | null> {
		let id: string | null = null;
		if (helper.getPluginId() == "soundcloud") {
			id = helper.getTrackId();
		} else {
			const identity = await helper.getIdentity("soundcloud_track_id");
			if (identity) {
				id = identity.identity;
			}
		}
		if (!id) {
			return null;
		}

		const track = await this.cache.getTrack(id);
		if (track.publisher_metadata?.upc_or_ean?.length == 13) {
			return [track.publisher_metadata.upc_or_ean];
		}
		return null;
	}

	getDependencies(): IdentifierDependency[] {
		return [];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [
			{
				sourceId: "soundcloud_track_id",
				pluginId: null,
			},
		];
	}
}
