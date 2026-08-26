import {
	IdentifierDependency,
	TrackIdentifier,
	TrackIdentifierTarget,
	TrackInformationHelper,
} from "@pipe-bomb/plugin-sdk";
import { SoundCloudCache } from "../soundcloud-cache.js";

export class ArtistIdTrackIdentifier implements TrackIdentifier {
	public readonly target: TrackIdentifierTarget = "artist";
	public readonly id = "soundcloud_artist_id";

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
		return [track.user_id.toString()];
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
