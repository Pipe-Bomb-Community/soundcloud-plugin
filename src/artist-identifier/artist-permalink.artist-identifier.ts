import {
	ArtistIdentifier,
	ArtistInformationHelper,
	IdentifierDependency,
} from "@pipe-bomb/plugin-sdk";
import { SoundCloudCache } from "../soundcloud-cache.js";

export class ArtistPermalinkArtistIdentifier implements ArtistIdentifier {
	public readonly id = "soundcloud_artist_permalink";

	constructor(private readonly cache: SoundCloudCache) {}

	getDependencies(): IdentifierDependency[] {
		return [
			{
				pluginId: null,
				sourceId: "soundcloud_artist_id",
			},
		];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [];
	}

	async identify(helper: ArtistInformationHelper): Promise<string[] | null> {
		const id = helper.getIdentity("soundcloud_artist_id");
		if (!id) {
			return null;
		}

		const user = await this.cache.getUser(id.identity);
		return [user.permalink];
	}
}
