import {
	ArtistIdentifier,
	ArtistInformationHelper,
	IdentifierDependency,
	Logger,
} from "@sdk";
import { WebProfile } from "../types/soundcloud.js";
import { SoundCloudCache } from "../soundcloud-cache.js";

export abstract class WebProfileArtistIdentifier implements ArtistIdentifier {
	public abstract readonly id: string;

	protected abstract getProfileId(profile: WebProfile): string | null;

	constructor(protected readonly cache: SoundCloudCache) {}

	async identify(
		helper: ArtistInformationHelper,
		_logger: Logger,
	): Promise<string[] | null> {
		const artistIdentities = helper.getIdentity(
			"soundcloud_artist_id",
			null,
			true,
		);

		if (!artistIdentities?.length) {
			return null;
		}

		const identities: string[] = [];

		for (const identity of artistIdentities) {
			const profiles = await this.cache.getUserWebProfiles(identity.identity);
			for (const profile of profiles) {
				const id = this.getProfileId(profile);
				if (id) {
					identities.push(id);
				}
			}
		}

		return identities;
	}

	getDependencies(): IdentifierDependency[] {
		return [
			{
				sourceId: "soundcloud_artist_id",
				pluginId: null,
			},
		];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [];
	}
}
